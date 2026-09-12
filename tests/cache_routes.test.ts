import { expect, spyOn, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as identify from '@/server/utils/identify'
import * as fileCache from '@/server/fileCache'
import { createCacheRouter } from '@/server/routes/cache'

test('local identification resolves its module and forwards a bounded file path', async () => {
  const previousLx = global.lx
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-identify-test-'))
  const file = path.join(dir, 'song.mp3')
  fs.writeFileSync(file, 'fixture')
  global.lx = { config: { 'frontend.password': 'identify-admin' } } as typeof global.lx
  const cacheDir = spyOn(fileCache, 'getCacheDir').mockReturnValue(dir)
  const identifySong = spyOn(identify, 'identifyLocalSong').mockResolvedValue([{ name: 'Identified song' }] as any)
  try {
    const request = (filename: string) => createCacheRouter().handle(new Request('http://localhost/api/music/identify', {
      method: 'POST', headers: { 'x-frontend-auth': 'identify-admin', 'content-type': 'application/json' },
      body: JSON.stringify({ filename }),
    }))
    const response = await request('song.mp3')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, results: [{ name: 'Identified song' }] })
    expect(identifySong).toHaveBeenCalledWith(file)
    identifySong.mockClear()
    expect((await request('../outside.mp3')).status).toBe(500)
    expect(identifySong).not.toHaveBeenCalled()
  } finally {
    identifySong.mockRestore()
    cacheDir.mockRestore()
    global.lx = previousLx
    fs.unlinkSync(file)
    fs.rmdirSync(dir)
  }
})
