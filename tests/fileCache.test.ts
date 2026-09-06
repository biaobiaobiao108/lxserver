import { describe, it, expect } from 'bun:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { resolveCompanionLyricFilename } from '../src/server/fileCache'
import { closeDb, initDatabase } from '../src/database'
import * as fileCache from '../src/server/fileCache'

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
    if (process.platform === 'win32') {
      expect(isSafePath(baseDir, 'C:\\Windows\\System32\\calc.exe')).toBe(false)
    } else {
      expect(isSafePath(baseDir, '/var/log/syslog')).toBe(false)
    }
  })

  it('should find a companion lyric file even when the extension casing differs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-file-cache-'))
    try {
      fs.mkdirSync(path.join(root, 'albums'), { recursive: true })
      fs.writeFileSync(path.join(root, 'albums', 'song.FLAC'), Buffer.from('audio'))
      fs.writeFileSync(path.join(root, 'albums', 'song.LRC'), '[00:00.00]lyrics')

      expect(resolveCompanionLyricFilename(root, 'albums/song.FLAC')).toBe('albums/song.LRC')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('should persist disk-discovered lyric state to the SQLite cache index', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-cache-index-'))
    const previousLx = (global as any).lx
    const dataPath = path.join(root, 'data')
    const dbPath = path.join(root, 'lxserver.db')
    try {
      closeDb()
      ;(global as any).lx = { dataPath, config: {} }
      initDatabase(dbPath)
      fileCache.setCacheLocation(fileCache.CACHE_ROOTS.DATA)

      const musicDir = fileCache.getCacheDir('test-user', true)
      fs.mkdirSync(path.join(musicDir, 'album'), { recursive: true })
      const audioFilename = 'album/song.flac'
      const lyricFilename = 'album/song.lrc'
      const audioPath = path.join(musicDir, audioFilename)
      fs.writeFileSync(audioPath, Buffer.from('not-a-real-audio-file'))
      fs.writeFileSync(path.join(musicDir, lyricFilename), '[00:00.00]lyrics')
      const stats = fs.statSync(audioPath)

      fileCache.indexManager.update('test-user', {
        id: 'wy_test-song',
        songmid: 'wy_test-song',
        name: 'Test Song',
        singer: 'Test Singer',
        album: 'Test Album',
        source: 'wy',
        quality: 'flac',
        filename: audioFilename,
        folder: 'music',
        mtime: stats.mtimeMs,
        size: stats.size,
        ext: 'flac',
        hasCover: false,
        coverType: 'none',
        hasLyric: false,
        coverCheckedVersion: 5,
        coverCheckedMtime: stats.mtimeMs,
        coverCheckedSize: stats.size,
        interval: '00:01',
        bitrate: 1000,
      }, 'music')

      const lyric = fileCache.checkLyricCache({
        source: 'wy',
        songmid: 'test-song',
        id: 'wy_test-song',
        name: 'Test Song',
        singer: 'Test Singer',
      }, 'test-user')
      expect(lyric.exists).toBe(true)

      await fileCache.syncCacheIndex('test-user', ['music'])
      const repaired = fileCache.indexManager.get('test-user', 'wy_test-song', 'music', 'flac', true)
      expect(repaired?.hasLyric).toBe(true)
      expect(repaired?.lyricFilename).toBe(lyricFilename)
    } finally {
      closeDb()
      ;(global as any).lx = previousLx
      fileCache.setCacheLocation(fileCache.CACHE_ROOTS.ROOT)
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
