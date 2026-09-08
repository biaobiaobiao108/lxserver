import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { initDatabase, closeDb } from '@/database'
import { createClientKeyInfo, getUserSpace, releaseUserSpace, syncUsersToDatabase } from '@/user'
import { aesDecrypt, aesEncrypt } from '@/utils/tools'
import { SYNC_CODE } from '@/constants'
import { createSyncRouter } from '@/server/routes/sync'
import { authConnect } from '@/server/auth'
import { handleSocketUpgrade } from '@/server/sync/socketServer'

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

  test('authenticates both absolute Web Requests and relative legacy URLs', async () => {
    const query = new URLSearchParams({ i: keyInfo.clientId, t: aesEncrypt(SYNC_CODE.msgConnect, keyInfo.key) })
    await expect(authConnect(`/${username}?${query}`, '192.0.2.20')).resolves.toBeUndefined()
    const request = new Request(`http://localhost/${username}?${query}`)
    let upgraded = false
    const response = await handleSocketUpgrade(request, {
      requestIP: () => ({ address: '192.0.2.20' }),
      upgrade: () => { upgraded = true; return true },
    } as any)
    expect(upgraded).toBe(true)
    expect(response?.status).toBe(200)
  })

  test('decodes user paths while rejecting credentials belonging to a different user', async () => {
    const query = new URLSearchParams({ i: keyInfo.clientId, t: aesEncrypt(SYNC_CODE.msgConnect, keyInfo.key) })
    await expect(authConnect(new Request(`http://localhost/%73ync_test_user?${query}`), '192.0.2.21'))
      .resolves.toBeUndefined()
    await expect(authConnect(new Request(`http://localhost/another_user?${query}`), '192.0.2.21'))
      .rejects.toThrow('User mismatch')
    await expect(authConnect(new Request(`http://localhost/${username}?i=${encodeURIComponent(keyInfo.clientId)}&t=invalid`), '192.0.2.21'))
      .rejects.toThrow('failed')
  })
})
