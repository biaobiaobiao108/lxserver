import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Open } from 'unzipper'
import { ZipArchive } from 'archiver'
import { closeDb, createDatabaseSnapshot, getDb, restoreDatabaseSnapshot } from '@/database'
import { getUserSpace, resetUserSpaces, syncUsersToDatabase } from '@/user'
import { createPlayerSession, checkPlayerAuthSession, SESSION_COOKIE_NAME } from '@/server/auth'
import { userSessions, persistentTokens, saveUserTokenConfig, revokeUserAuth } from '@/server/routes/auth'
import { createSystemRouter } from '@/server/routes/system'
import WebDAVSync from '@/utils/webdavSync'

let previousLx: typeof global.lx
let directory: string
let webdav: WebDAVSync
const owner = 'backup-owner'
beforeEach(() => {
  previousLx = global.lx
  closeDb()
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-backup-test-'))
  global.lx = {
    dataPath: directory, userPath: directory,
    config: { users: [{ name: owner, password: 'local-password' }], 'frontend.password': 'backup-admin', 'player.enableAuth': true },
  } as typeof global.lx
  syncUsersToDatabase(global.lx.config.users)
  webdav = new WebDAVSync({ url: '' }, directory)
})
afterEach(() => {
  revokeUserAuth(owner)
  resetUserSpaces()
  closeDb()
  global.lx = previousLx
  Bun.gc(true) // Release native statement references before removing Windows SQLite fixture files.
  // All fixture files are created under a unique temporary directory owned by this test.
  fs.rmSync(directory, { recursive: true, force: true })
})

test('backup includes committed WAL data and manual restore refreshes durable data and cached lists', async () => {
  const db = getDb()
  db.run('PRAGMA wal_autocheckpoint = 0')
  const original = { defaultList: [], loveList: [], userList: [{ id: 'saved', name: 'Saved list', list: [] }] }
  const lists = getUserSpace(owner).listManage
  await lists.saveSnapshotWithTime('saved', JSON.stringify(original), Date.now())
  await lists.restoreSnapshot('saved')
  db.run('INSERT INTO user_settings (user_name, key, value, updated_at) VALUES (?, ?, ?, ?)',
    [owner, 'library_artists', '[{"id":"saved"}]', Date.now()])
  saveUserTokenConfig(owner, { enabled: true, tokens: [{ token: 'backup-api-token', name: 'Backup token', createdAt: Date.now(), expiresAt: null }] })
  const session = createPlayerSession()
  userSessions.set('pre-restore-session', { username: owner, createdAt: Date.now() })
  fs.writeFileSync(path.join(directory, 'ordinary.txt'), 'saved file')
  expect(fs.statSync(path.join(directory, 'lxserver.db-wal')).size).toBeGreaterThan(0)
  const zipName = await webdav.createBackup()
  expect(zipName).not.toBeNull()
  const zipPath = path.join(directory, zipName!)
  const archive = await Open.file(zipPath)
  expect(archive.files.map(file => file.path)).toContain('lxserver.db')
  expect(archive.files.map(file => file.path)).not.toContain('lxserver.db-wal')
  db.run('UPDATE user_settings SET value = ? WHERE key = ?', ['[]', 'library_artists'])
  await lists.saveSnapshotWithTime('changed', JSON.stringify({ ...original, userList: [] }), Date.now())
  await lists.restoreSnapshot('changed')
  saveUserTokenConfig(owner, { enabled: false, tokens: [] })
  expect((await lists.getListData()).userList).toEqual([])
  fs.writeFileSync(path.join(directory, 'ordinary.txt'), 'changed file')
  let requestedPath = ''
  ;(webdav as any).client = {
    getDirectoryContents: async (remote: string) => {
      requestedPath = remote
      return [{ basename: zipName, filename: `/lx-sync-backups/${zipName}` }]
    },
    getFileContents: async () => fs.readFileSync(zipPath),
  }
  global.lx.webdavSync = webdav
  const response = await createSystemRouter().handle(new Request('http://localhost/api/webdav/restore', {
    method: 'POST', headers: { 'x-frontend-auth': 'backup-admin' },
  }))
  expect(await response.json()).toEqual({ success: true })
  expect(requestedPath).toBe('/lx-sync-backups/')
  expect((await getUserSpace(owner).listManage.getListData()).userList).toEqual(original.userList)
  expect(db.query('SELECT value FROM user_settings WHERE key = ?').get('library_artists')).toEqual({ value: '[{"id":"saved"}]' })
  expect(fs.readFileSync(path.join(directory, 'ordinary.txt'), 'utf8')).toBe('saved file')
  expect(persistentTokens.get('backup-api-token')).toBe(owner)
  expect(userSessions.has('pre-restore-session')).toBe(false)
  expect(checkPlayerAuthSession({ [SESSION_COOKIE_NAME]: session })).toBe(false)
  expect(global.lx.config.users[0].password).toBe('local-password')
})

test('incompatible or invalid snapshots leave the current database unchanged', () => {
  const db = getDb()
  db.run('INSERT INTO user_settings (user_name, key, value, updated_at) VALUES (?, ?, ?, ?)', [owner, 'sentinel', 'original', Date.now()])
  const snapshot = path.join(directory, 'invalid.db')
  createDatabaseSnapshot(snapshot)
  const invalid = new Database(snapshot)
  invalid.run('PRAGMA foreign_keys = OFF')
  invalid.run('INSERT INTO devices (client_id, user_name, key, device_name) VALUES (?, ?, ?, ?)', ['invalid-device', 'missing-user', 'key', 'device'])
  invalid.close()
  expect(() => restoreDatabaseSnapshot(snapshot)).toThrow()
  expect(db.query('SELECT value FROM user_settings WHERE key = ?').get('sentinel')).toEqual({ value: 'original' })
  expect(db.query('SELECT name FROM users WHERE name = ?').get(owner)).toEqual({ name: owner })
  fs.writeFileSync(path.join(directory, 'corrupt.db'), 'not a database')
  expect(() => restoreDatabaseSnapshot(path.join(directory, 'corrupt.db'))).toThrow()
  expect(db.query('SELECT value FROM user_settings WHERE key = ?').get('sentinel')).toEqual({ value: 'original' })
})

test('periodic backups run for database-only changes excluded by the file scanner', async () => {
  let uploads = 0
  ;(webdav as any).client = {
    putFileContents: async (_remote: string, stream: any) => { for await (const _chunk of stream) { } uploads++ },
    getDirectoryContents: async () => [],
  }
  await (webdav as any).getChangedFiles()
  getDb().run('INSERT INTO user_settings (user_name, key, value, updated_at) VALUES (?, ?, ?, ?)', [owner, 'changed', '1', Date.now()])
  expect(await webdav.uploadBackup()).toBe(true)
  expect(uploads).toBe(1)
})

test('old archives without a database cannot report a successful full restore', async () => {
  const zipPath = path.join(directory, 'legacy.zip')
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const zip = new ZipArchive()
    output.on('close', resolve)
    output.on('error', reject)
    zip.on('error', reject)
    zip.pipe(output)
    zip.append('replacement', { name: 'ordinary.txt' })
    void zip.finalize()
  })
  await expect(webdav.extractZip(zipPath, directory)).rejects.toThrow('备份缺少有效数据库')
  expect(fs.existsSync(path.join(directory, 'ordinary.txt'))).toBe(false)
})
