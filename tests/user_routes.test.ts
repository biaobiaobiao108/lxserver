import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { closeDb, getDb, initDatabase } from '@/database'
import { getUserSpace, releaseUserSpace, syncUsersToDatabase } from '@/user'
import { createUserRouter } from '@/server/routes/user'
import { userSessions } from '@/server/routes/auth'

describe('User snapshot permissions', () => {
  let previousLx: typeof global.lx
  const username = 'snapshot_owner'
  const sessionToken = 'snapshot-owner-session'
  const initialData = { defaultList: [], loveList: [], userList: [] }
  const uploadedData = { ...initialData, userList: [{ id: 'playlist', name: 'Uploaded', list: [] }] }
  const userHeaders = { 'x-user-token': sessionToken }
  const adminHeaders = { 'x-frontend-auth': 'snapshot-admin' }

  beforeEach(async () => {
    previousLx = global.lx
    closeDb()
    initDatabase(':memory:')
    global.lx = {
      userPath: process.cwd(),
      config: {
        users: [{ name: username, password: 'password' }],
        'frontend.password': 'snapshot-admin',
        'user.enablePublicFavorites': true,
        'user.enablePublicNonAdminAccess': true,
        'user.enablePublicRestriction': true,
      },
    } as typeof global.lx
    syncUsersToDatabase(global.lx.config.users)
    userSessions.set(sessionToken, { username, createdAt: Date.now() })
    for (const owner of ['_open', username]) {
      const manager = getUserSpace(owner).listManage
      await manager.getListData()
      await manager.saveSnapshotWithTime('original', JSON.stringify(initialData), Date.now())
    }
  })

  afterEach(() => {
    userSessions.delete(sessionToken)
    for (const owner of ['_open', username]) releaseUserSpace(owner, true)
    closeDb()
    global.lx = previousLx
  })

  const snapshotRequest = (action: string, owner: string, headers: Record<string, string> = {}) => (
    new Request(`http://localhost/api/data/${action}-snapshot?user=${owner}&filename=uploaded`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(action === 'upload' ? uploadedData : { id: 'original' }),
    })
  )

  test('public readers cannot upload, restore or delete snapshots through any public alias', async () => {
    const router = createUserRouter()
    for (const headers of [{}, userHeaders]) {
      for (const owner of ['default', 'open', '_open']) {
        for (const action of ['upload', 'restore', 'delete']) {
          const response = await router.handle(snapshotRequest(action, owner, headers))
          expect(response.status).toBe(403)
        }
      }
    }
    expect(await getUserSpace('_open').listManage.getSnapshot('original')).toEqual(initialData)
    expect(await getUserSpace('_open').listManage.getSnapshot('uploaded')).toBeNull()
    expect(getDb().query('SELECT latest_id FROM snapshot_meta WHERE user_name = ?').get('_open')).toBeNull()
    const read = await router.handle(new Request('http://localhost/api/data/snapshot?user=_open&id=original'))
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual(initialData)
  })

  test('administrators can write public snapshots and users can manage their own snapshots', async () => {
    const router = createUserRouter()
    for (const [owner, headers] of [['_open', adminHeaders], [username, userHeaders]] as const) {
      const upload = await router.handle(snapshotRequest('upload', owner, headers))
      expect(upload.status).toBe(200)
      expect(await getUserSpace(owner).listManage.getSnapshot('uploaded')).toEqual(uploadedData)

      const restore = await router.handle(snapshotRequest('restore', owner, headers))
      expect(restore.status).toBe(200)
      expect(getDb().query('SELECT latest_id FROM snapshot_meta WHERE user_name = ?').get(owner))
        .toEqual({ latest_id: 'original' })

      const remove = await router.handle(snapshotRequest('delete', owner, headers))
      expect(remove.status).toBe(200)
      expect(await getUserSpace(owner).listManage.getSnapshot('original')).toBeNull()
    }
    expect((await router.handle(snapshotRequest('upload', 'another_user', userHeaders))).status).toBe(403)
  })
})
