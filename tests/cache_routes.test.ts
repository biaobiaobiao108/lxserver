import { expect, spyOn, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dns from 'node:dns/promises'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import * as identify from '@/server/utils/identify'
import * as fileCache from '@/server/fileCache'
import { createCacheRouter } from '@/server/routes/cache'

test('download proxy isolates active content and preserves media responses', async () => {
  const lookup = spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any)
  let mime = 'text/html'
  const content = Buffer.from('<script>window.untrusted=true</script>')
  const request = spyOn(http, 'request').mockImplementation((_url: any, _options: any, callback: any) => {
    const req = new EventEmitter() as any
    req.destroy = () => {}
    req.end = () => {
      const response = Readable.from([content]) as any
      response.statusCode = 200
      response.headers = { 'content-type': mime }
      callback(response)
    }
    return req
  })
  try {
    for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'audio/mpeg', 'image/png']) {
      mime = type
      const response = await createCacheRouter().handle(new Request('http://localhost/api/music/download?inline=1&url=http%3A%2F%2Fexample.com%2Ffile'))
      expect(response.status).toBe(200)
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('content-security-policy')).toContain('sandbox')
      const media = type === 'audio/mpeg' || type === 'image/png'
      expect(response.headers.get('content-type')).toBe(media ? type : 'application/octet-stream')
      if (media) expect(response.headers.get('content-disposition')).toBeNull()
      else expect(response.headers.get('content-disposition')).toStartWith('attachment;')
      expect(Buffer.from(await response.arrayBuffer())).toEqual(content)
    }
  } finally {
    request.mockRestore()
    lookup.mockRestore()
  }
})

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
