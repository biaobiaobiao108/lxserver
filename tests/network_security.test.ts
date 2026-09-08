import { describe, expect, spyOn, test } from 'bun:test'
import dns from 'node:dns/promises'
import http from 'node:http'
import { assertSafeRemoteHttpUrl } from '@/server/networkSecurity'
import { createCacheRouter } from '@/server/routes/cache'

describe('Outbound URL network boundaries', () => {
  test.each([
    '127.0.0.1', '10.0.0.1', '169.254.169.254',
    '[::1]', '[0:0:0:0:0:0:0:1]', '[fc00::1]', '[fe80::1]',
    '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[0:0:0:0:0:FFFF:7F00:1]',
    '[::ffff:10.0.0.1]', '[::ffff:192.168.1.1]', '[::ffff:169.254.169.254]',
  ])('rejects private address %s', async (host) => {
    await expect(assertSafeRemoteHttpUrl(`http://${host}/audio`)).rejects.toThrow('Private network URL is not allowed')
  })

  test.each(['8.8.8.8', '[2001:4860:4860::8888]', '[::ffff:8.8.8.8]'])('allows public literal %s', async (host) => {
    expect((await assertSafeRemoteHttpUrl(`https://${host}/audio`)).protocol).toBe('https:')
  })

  test('rejects mapped private DNS results, including dotted and expanded forms', async () => {
    const lookup = spyOn(dns, 'lookup')
    try {
      for (const address of ['::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:c0a8:101']) {
        lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address, family: 6 }] as any)
        await expect(assertSafeRemoteHttpUrl('https://example.com/audio')).rejects.toThrow('Private network URL is not allowed')
      }
    } finally {
      lookup.mockRestore()
    }
  })

  test('retains hostname-based synthetic DNS support while rejecting private or literal targets', async () => {
    const lookup = spyOn(dns, 'lookup')
    try {
      lookup.mockResolvedValue([{ address: '198.18.0.1', family: 4 }] as any)
      expect((await assertSafeRemoteHttpUrl('https://example.com/audio')).hostname).toBe('example.com')
      await expect(assertSafeRemoteHttpUrl('http://198.18.0.1/audio')).rejects.toThrow('Private network URL is not allowed')
      lookup.mockResolvedValue([{ address: 'fdfe:dcba:9876::1', family: 6 }] as any)
      expect((await assertSafeRemoteHttpUrl('https://example.com/audio')).hostname).toBe('example.com')
      lookup.mockResolvedValue([{ address: '198.18.0.1', family: 4 }, { address: '192.168.1.1', family: 4 }] as any)
      await expect(assertSafeRemoteHttpUrl('https://example.com/audio')).rejects.toThrow('Private network URL is not allowed')
    } finally {
      lookup.mockRestore()
    }
  })

  test('anonymous download proxy blocks mapped loopback before opening an outbound request', async () => {
    const request = spyOn(http, 'request').mockImplementation(() => { throw new Error('Unexpected outbound request') })
    try {
      const router = createCacheRouter()
      const response = await router.handle(new Request('http://localhost/api/music/download?url='
        + encodeURIComponent('http://[::ffff:127.0.0.1]:9527/')))
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(request).not.toHaveBeenCalled()
    } finally {
      request.mockRestore()
    }
  })
})
