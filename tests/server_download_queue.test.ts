import { describe, expect, test } from 'bun:test'
import { deduplicateDownloadTasks, pruneDownloadHistory, type ServerDownloadTask } from '@/server/serverDownloadQueue'

const makeTask = (
  username: string,
  id: string,
  status: ServerDownloadTask['status'],
  updatedAt: number,
): ServerDownloadTask => ({
  id,
  username,
  songKey: `${username}_${id}`,
  songInfo: { id, name: id },
  quality: '320k',
  requestedQuality: '320k',
  status,
  progress: status === 'finished' ? 100 : 0,
  total: 0,
  received: 0,
  speed: 0,
  errorMsg: '',
  enableOnlyDownloadMode: false,
  cacheLyric: true,
  embedLyric: true,
  createdAt: updatedAt,
  updatedAt,
})

describe('Server download queue retention', () => {
  test('caps terminal history per user while retaining active and resumable tasks', () => {
    const history = Array.from({ length: 5 }, (_, index) => (
      makeTask('user-a', `finished-${index}`, 'finished', index)
    ))
    const otherUserHistory = Array.from({ length: 3 }, (_, index) => (
      makeTask('user-b', `finished-${index}`, 'error', index)
    ))
    const active = makeTask('user-a', 'active', 'downloading', 0)
    const paused = makeTask('user-a', 'paused', 'paused', 0)

    const retained = pruneDownloadHistory(
      [...history, ...otherUserHistory, active, paused],
      2,
    )

    expect(retained.filter(task => task.username === 'user-a' && task.status === 'finished')).toHaveLength(2)
    expect(retained.filter(task => task.username === 'user-b')).toHaveLength(2)
    expect(retained.some(task => task.id === 'active')).toBe(true)
    expect(retained.some(task => task.id === 'paused')).toBe(true)
  })
})

describe('Server download queue deduplication', () => {
  test('keeps one task per user/song/quality and prefers a completed task', () => {
    const waiting = makeTask('user-a', 'waiting-copy', 'waiting', 20)
    waiting.songInfo = { source: 'wy', songmid: 167655, name: 'Sign', singer: 'FLOW' }
    waiting.songKey = 'wy_167655_flac'
    waiting.quality = 'flac'
    waiting.requestedQuality = 'flac'

    const finished = makeTask('user-a', 'finished-copy', 'finished', 10)
    finished.songInfo = { source: 'wy', songmid: 167655, name: 'Sign', singer: 'FLOW' }
    finished.songKey = 'wy_167655_flac'
    finished.quality = 'flac'
    finished.requestedQuality = 'flac'

    const retained = deduplicateDownloadTasks([waiting, finished])

    expect(retained).toHaveLength(1)
    expect(retained[0]?.id).toBe('finished-copy')
    expect(retained[0]?.status).toBe('finished')
  })
})
