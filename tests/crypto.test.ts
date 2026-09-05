import { describe, it, expect } from 'bun:test'
import { toMD5 } from '../src/modules/utils/index'
import bdSongList from '../src/modules/utils/musicSdk/bd/songList.js'

describe('Crypto & Encryption Verification', () => {
  it('toMD5 should generate correct MD5 hashes', () => {
    // Standard empty string hash
    expect(toMD5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    // Standard test vectors
    expect(toMD5('hello world')).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3')
  })

  it('bd/songList.js aesPassEncod produces valid timestamp, param, sign', () => {
    const payload = {
      songId: '123456',
      rate: '320',
    }

    const res = bdSongList.aesPassEncod(payload)

    expect(typeof res.timestamp).toBe('number')
    expect(typeof res.param).toBe('string')
    expect(res.param.length).toBeGreaterThan(0)
    expect(typeof res.sign).toBe('string')
    expect(res.sign).toHaveLength(32) // MD5 hex length
  })
})
