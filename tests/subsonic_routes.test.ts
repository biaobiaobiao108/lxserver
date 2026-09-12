import { afterEach, beforeEach, expect, test } from 'bun:test'
import { closeDb, getDb, initDatabase } from '@/database'
import { releaseUserSpace, syncUsersToDatabase } from '@/user'
import { createSubsonicRouter } from '@/server/routes/subsonic'
import { createUserRouter } from '@/server/routes/user'

let previousLx: typeof global.lx
beforeEach(() => {
  previousLx = global.lx
  closeDb()
  initDatabase(':memory:')
  global.lx = { userPath: process.cwd(), config: { users: [{ name: 'library-owner', password: 'test-pass' }] } } as typeof global.lx
  syncUsersToDatabase(global.lx.config.users)
})
afterEach(() => {
  releaseUserSpace('library-owner', true)
  closeDb()
  global.lx = previousLx
})

test('Subsonic immediately reads artist and album favorites saved by the player', async () => {
  const player = createUserRouter()
  for (const type of ['artists', 'albums']) {
    const response = await player.handle(new Request(`http://localhost/api/user/library/${type}`, {
      method: 'POST',
      headers: { 'x-user-name': 'library-owner', 'x-user-password': 'test-pass', 'content-type': 'application/json' },
      body: JSON.stringify([{ id: '123', name: `Saved ${type}`, source: 'wy' }]),
    }))
    expect(response.status).toBe(200)
  }
  const router = createSubsonicRouter()
  const read = () => router.handle(new Request('http://localhost/rest/getStarred2?u=library-owner&p=test-pass&f=json&v=1.16.1&c=test'))
  const data = (await (await read()).json())['subsonic-response'].starred2
  expect(data.artist).toEqual([expect.objectContaining({ id: 'art_wy_123', name: 'Saved artists' })])
  expect(data.album).toEqual([expect.objectContaining({ id: 'alb_wy_123', name: 'Saved albums' })])
  getDb().run('DELETE FROM user_settings WHERE user_name = ?', ['library-owner'])
  const empty = (await (await read()).json())['subsonic-response'].starred2
  expect(empty.artist).toEqual([])
  expect(empty.album).toEqual([])
})
