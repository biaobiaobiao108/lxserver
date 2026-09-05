import { describe, it, expect } from 'bun:test'
import path from 'path'

describe('File Cache Path Traversal Defense', () => {
  const isSafePath = (baseDir: string, requestedRelativePath: string) => {
    // Normalization logic identical to serveCacheFile
    const safeFilename = requestedRelativePath.replace(/\\/g, '/')
    const normalizedBase = path.resolve(baseDir)
    const normalizedTarget = path.resolve(baseDir, safeFilename)
    return normalizedTarget === normalizedBase || normalizedTarget.startsWith(normalizedBase + path.sep)
  }

  const baseDir = path.resolve(process.cwd(), 'data/cache')

  it('should accept valid child paths within base directory', () => {
    expect(isSafePath(baseDir, 'user1/song.mp3')).toBe(true)
    expect(isSafePath(baseDir, 'sub/folder/file.flac')).toBe(true)
  })

  it('should reject path traversal attempts escaping base directory', () => {
    expect(isSafePath(baseDir, '../../package.json')).toBe(false)
    expect(isSafePath(baseDir, '..\\..\\config.js')).toBe(false)
    expect(isSafePath(baseDir, '/etc/passwd')).toBe(false)
    expect(isSafePath(baseDir, '..\\..\\..\\etc\\passwd')).toBe(false)
    expect(isSafePath(baseDir, 'C:\\Windows\\System32\\calc.exe')).toBe(false)
  })
})
