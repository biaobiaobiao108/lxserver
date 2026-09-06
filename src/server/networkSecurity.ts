import dns from 'node:dns/promises'

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
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  if (normalized.includes('.')) {
    const mapped = normalized.slice(normalized.lastIndexOf(':') + 1)
    if (isPrivateIpv4(mapped)) return true
  }
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff')
}

const isPrivateAddress = (value: string): boolean => {
  if (value.includes('.')) return isPrivateIpv4(value)
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

  const addresses = await dns.lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some(address => isPrivateAddress(address.address))) {
    throw new Error('Private network URL is not allowed')
  }
  return url
}
