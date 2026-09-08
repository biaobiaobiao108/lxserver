import dns from 'node:dns/promises'
import { isIP } from 'node:net'

const ipv4ToNumber = (value: string): number | null => {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null
  const nums = parts.map(Number)
  if (nums.some(num => num > 255)) return null
  return (((nums[0] * 256 + nums[1]) * 256 + nums[2]) * 256 + nums[3]) >>> 0
}

const isPrivateIpv4 = (value: string): boolean => {
  const number = ipv4ToNumber(value)
  if (number == null) return false
  const ranges: Array<[number, number]> = [
    [0x00000000, 0x00ffffff], // current network / "this" host
    [0x0a000000, 0x0affffff], // RFC1918
    [0x64400000, 0x647fffff], // carrier-grade NAT
    [0x7f000000, 0x7fffffff], // loopback
    [0xa9fe0000, 0xa9feffff], // link-local
    [0xac100000, 0xac1fffff], // RFC1918
    [0xc0000000, 0xc00000ff], // IETF protocol assignments
    [0xc0000200, 0xc00002ff], // TEST-NET-1
    [0xc0586300, 0xc05863ff], // 6to4 relay anycast
    [0xc0a80000, 0xc0a8ffff], // RFC1918
    [0xc6120000, 0xc613ffff], // benchmarking
    [0xc6336400, 0xc63364ff], // TEST-NET-2
    [0xcb007100, 0xcb0071ff], // TEST-NET-3
    [0xe0000000, 0xffffffff], // multicast and reserved
  ]
  return ranges.some(([start, end]) => number >= start && number <= end)
}

const isPrivateIpv6 = (value: string): boolean => {
  const address = value.replace(/^\[|\]$/g, '').split('%')[0]
  let normalized: string
  try {
    // Canonicalize expanded and dotted IPv4-mapped IPv6 forms alike.
    normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1)
  } catch {
    return true
  }
  const mapped = normalized.match(/^::ffff:([\da-f]+):([\da-f]+)$/)
  if (mapped) {
    const high = parseInt(mapped[1], 16)
    const low = parseInt(mapped[2], 16)
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
  }
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff')
}

// Some desktop proxy clients use RFC 2544 benchmarking IPv4 addresses and a
// fixed ULA IPv6 prefix as synthetic DNS answers. They are not routable
// addresses of the requested host, but the proxy still needs to see the
// original hostname in order to route the request. Keep these values separate
// from real private addresses so normal DNS-rebinding protection remains in
// place for LAN and loopback targets.
const isSyntheticDnsAddress = (value: string): boolean => {
  const number = ipv4ToNumber(value)
  if (number != null) return number >= 0xc6120000 && number <= 0xc613ffff

  const normalized = value.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  return normalized.startsWith('fdfe:dcba:9876:')
}

const isPrivateAddress = (value: string): boolean => {
  if (isIP(value) === 4) return isPrivateIpv4(value)
  return isPrivateIpv6(value)
}

const isBlockedHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  return normalized === 'localhost' || normalized.endsWith('.localhost') || normalized === 'local'
}

/** Validate an outbound URL before any request is opened. */
export const assertSafeRemoteHttpUrl = async (rawUrl: string): Promise<URL> => {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) {
    throw new Error('Invalid remote URL')
  }
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Invalid remote URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only public HTTP(S) URLs are allowed')
  }
  if (isBlockedHostname(url.hostname)) throw new Error('Private network URL is not allowed')

  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const hostnameIsIpLiteral = isIP(hostname) !== 0
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  const hasPrivateAddress = addresses.some(address => isPrivateAddress(address.address))
  const onlySyntheticAddresses = !hostnameIsIpLiteral
    && addresses.length > 0
    && addresses.every(address => isSyntheticDnsAddress(address.address))
  if (addresses.length === 0 || (hasPrivateAddress && !onlySyntheticAddresses)) {
    throw new Error('Private network URL is not allowed')
  }
  return url
}
