import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { initDatabase, closeDb } from '@/database'
import { createClientKeyInfo, getUserSpace, releaseUserSpace, syncUsersToDatabase } from '@/user'
import { aesDecrypt, aesEncrypt } from '@/utils/tools'
import { SYNC_CODE } from '@/constants'
import { createSyncRouter } from '@/server/routes/sync'

describe('Client sync authentication', () => {
  let previousLx: typeof global.lx
  const username = 'sync_test_user'
  let keyInfo: LX.Sync.KeyInfo

  beforeEach(() => {
    previousLx = global.lx
    closeDb()
    initDatabase(':memory:')
    global.lx = {
      userPath: process.cwd(),
      config: {
        users: [{ name: username, password: 'sync-password' }],
        'proxy.enabled': false,
        'proxy.header': 'x-forwarded-for',
        'user.enablePath': true,
        'user.enableRoot': false,
      },
    } as typeof global.lx
    syncUsersToDatabase(global.lx.config.users)
    keyInfo = createClientKeyInfo('Test Device', false)
    getUserSpace(username).dataManage.saveClientKeyInfo(keyInfo)
  })

  afterEach(async () => {
    await getUserSpace(username).listManage.getListData()
    releaseUserSpace(username, true)
    closeDb()
    global.lx = previousLx
  })

  test('direct handshake authenticates without proxy headers or a Node socket', async () => {
    const response = await createSyncRouter().handle(new Request(`http://localhost/${username}/ah`, {
      headers: { i: keyInfo.clientId, m: aesEncrypt(SYNC_CODE.authMsg + keyInfo.deviceName, keyInfo.key) },
    }), { remoteAddress: '192.0.2.10' })

    expect(response.status).toBe(200)
    expect(aesDecrypt(await response.text(), keyInfo.key)).toBe(SYNC_CODE.helloMsg)
  })

  test('failed handshakes are rate limited by peer address, ignoring untrusted forwarding headers', async () => {
    const router = createSyncRouter()
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await router.handle(new Request(`http://localhost/${username}/ah`, {
        headers: { 'x-forwarded-for': `198.51.100.${attempt + 1}` },
      }), { remoteAddress: '192.0.2.11' })
      expect(response.status).toBe(401)
    }
    expect((await router.handle(new Request(`http://localhost/${username}/ah`),
      { remoteAddress: '192.0.2.11' })).status).toBe(403)
    expect((await router.handle(new Request(`http://localhost/${username}/ah`),
      { remoteAddress: '192.0.2.12' })).status).toBe(401)
  })
})
