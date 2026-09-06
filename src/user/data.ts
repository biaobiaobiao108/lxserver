import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { filterFileName, toMD5 } from '@/utils'
import { getDb, getDbStatement } from '@/database'
import { assertSafePathSegment } from '@/utils/pathSecurity'

export interface ServerInfo {
  serverId: string
  version: number
}

export const getServerId = (): string => {
  const db = getDb()
  const row = db.query<{ value: string }, [string]>(
    'SELECT value FROM system_info WHERE key = ?'
  ).get('server_id')

  if (row) return row.value

  const newId = randomBytes(4 * 4).toString('base64')
  db.run('INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)', ['server_id', newId])
  return newId
}

export const getVersion = (): number => {
  const db = getDb()
  const row = db.query<{ value: string }, [string]>(
    'SELECT value FROM system_info WHERE key = ?'
  ).get('server_version')
  return row ? parseInt(row.value, 10) : 2
}

export const setVersion = (version: number): void => {
  const db = getDb()
  db.run('INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)', ['server_version', version.toString()])
}

export const getUserDirname = (userName: string): string => {
  if (userName === '_open') return '_open'
  assertSafePathSegment(userName, 'user name')
  return `${filterFileName(userName)}_${toMD5(userName).substring(0, 6)}`
}

/** Synchronize configured users without deleting data belonging to removed users. */
export const syncUsersToDatabase = (users: LX.Config['users']): void => {
  const db = getDb()
  const now = Date.now()
  const tx = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO users (name, password, max_snapshot_num, add_music_location_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM users WHERE name = ?), ?), ?)
    `)
    for (const user of users) {
      stmt.run(
        user.name,
        '',
        user.maxSnapshotNum ?? 10,
        user['list.addMusicLocationType'] ?? 'bottom',
        user.name,
        now,
        now,
      )
    }
  })
  tx()
}

/** Remove every database record owned by a user before the account is deleted. */
export const deleteUserDataFromDatabase = (userName: string): void => {
  const db = getDb()
  const tx = db.transaction(() => {
    db.run('DELETE FROM device_snapshot_state WHERE client_id IN (SELECT client_id FROM devices WHERE user_name = ?)', [userName])
    db.run('DELETE FROM snapshots WHERE user_name = ?', [userName])
    db.run('DELETE FROM snapshot_meta WHERE user_name = ?', [userName])
    db.run('DELETE FROM user_settings WHERE user_name = ?', [userName])
    db.run('DELETE FROM cache_index WHERE user_name = ?', [userName])
    db.run('DELETE FROM devices WHERE user_name = ?', [userName])
    db.run('DELETE FROM users WHERE name = ?', [userName])
  })
  tx()
}

export const getUserConfig = (userName: string): Required<LX.User> => {
  const stmt = getDbStatement<{
    name: string
    password: string
    max_snapshot_num: number
    add_music_location_type: string
  }, [string]>('SELECT * FROM users WHERE name = ?')
  const row = stmt.get(userName)

  if (row) {
    return {
      name: row.name,
      password: global.lx.config.users?.find(u => u.name === userName)?.password ?? row.password,
      maxSnapshotNum: row.max_snapshot_num ?? 10,
      'list.addMusicLocationType': row.add_music_location_type as any ?? 'bottom',
    }
  }

  const user = global.lx.config.users?.find(u => u.name === userName)
  if (!user) throw new Error('user not found: ' + userName)
  return {
    maxSnapshotNum: global.lx.config.maxSnapshotNum,
    'list.addMusicLocationType': global.lx.config['list.addMusicLocationType'],
    ...user,
  }
}

export const getUserName = (clientId: string | null): string | null => {
  if (!clientId) return null
  const stmt = getDbStatement<{ user_name: string }, [string]>(
    'SELECT user_name FROM devices WHERE client_id = ?'
  )
  const row = stmt.get(clientId)
  return row?.user_name ?? null
}

export const setUserName = (clientId: string, userName: string): void => {
  const stmt = getDbStatement('UPDATE devices SET user_name = ? WHERE client_id = ?')
  stmt.run(userName, clientId)
}

export const deleteUserName = (clientId: string): void => {
  const stmt = getDbStatement('DELETE FROM devices WHERE client_id = ?')
  stmt.run(clientId)
}

export const migrateUserData = (oldName: string, newName: string): string => {
  const db = getDb()
  const now = Date.now()

  // 1. 事务重命名所有数据库归属
  const tx = db.transaction(() => {
    // A. 复制或更新 users
    const oldUser = db.query<any, [string]>('SELECT * FROM users WHERE name = ?').get(oldName)
    if (oldUser) {
      db.run(
        'INSERT OR REPLACE INTO users (name, password, max_snapshot_num, add_music_location_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newName, '', oldUser.max_snapshot_num, oldUser.add_music_location_type, oldUser.created_at, now]
      )
    }

    // B. 更新 devices
    db.run('UPDATE devices SET user_name = ? WHERE user_name = ?', [newName, oldName])

    // C. 更新 snapshots 与 meta
    db.run('UPDATE snapshots SET user_name = ? WHERE user_name = ?', [newName, oldName])
    db.run('UPDATE snapshot_meta SET user_name = ? WHERE user_name = ?', [newName, oldName])

    // D. 更新 user_settings
    db.run('UPDATE user_settings SET user_name = ? WHERE user_name = ?', [newName, oldName])

    // E. 更新 cache_index
    db.run('UPDATE cache_index SET user_name = ? WHERE user_name = ?', [newName, oldName])

    // F. 删除旧 user
    db.run('DELETE FROM users WHERE name = ?', [oldName])
  })
  tx()

  // 2. 文件夹重命名或迁移 (静态文件如自定义源、封面等依然兼容)
  const oldDirname = getUserDirname(oldName)
  const newDirname = getUserDirname(newName)
  const oldDirPath = path.join(global.lx.userPath, oldDirname)
  const newDirPath = path.join(global.lx.userPath, newDirname)

  if (fs.existsSync(oldDirPath) && !fs.existsSync(newDirPath)) {
    try {
      fs.cpSync(oldDirPath, newDirPath, { recursive: true })
      fs.rmSync(oldDirPath, { recursive: true, force: true })
    } catch { }
  }

  return newDirPath
}

export const createClientKeyInfo = (deviceName: string, isMobile: boolean): LX.Sync.KeyInfo => {
  return {
    clientId: randomBytes(4 * 4).toString('base64'),
    key: randomBytes(16).toString('base64'),
    deviceName,
    isMobile,
    lastConnectDate: 0,
  }
}

export class UserDataManage {
  userName: string
  userDir: string

  getAllClientKeyInfo = (): LX.Sync.KeyInfo[] => {
    const stmt = getDbStatement<{
      client_id: string
      key: string
      device_name: string
      is_mobile: number
      last_connect_date: number
    }, [string]>('SELECT * FROM devices WHERE user_name = ? ORDER BY last_connect_date DESC')
    const rows: any[] = stmt.all(this.userName)

    return rows.map((r: any) => ({
      clientId: r.client_id,
      key: r.key,
      deviceName: r.device_name,
      isMobile: !!r.is_mobile,
      lastConnectDate: r.last_connect_date,
    }))
  }

  saveClientKeyInfo = (keyInfo: LX.Sync.KeyInfo): void => {
    const stmt = getDbStatement(`
      INSERT OR REPLACE INTO devices (client_id, user_name, key, device_name, is_mobile, last_connect_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      keyInfo.clientId,
      this.userName,
      keyInfo.key,
      keyInfo.deviceName || 'Unknown',
      keyInfo.isMobile ? 1 : 0,
      keyInfo.lastConnectDate || Date.now(),
    )
  }

  getClientKeyInfo = (clientId: string | null): LX.Sync.KeyInfo | null => {
    if (!clientId) return null
    const stmt = getDbStatement<{
      client_id: string
      key: string
      device_name: string
      is_mobile: number
      last_connect_date: number
    }, [string, string]>('SELECT * FROM devices WHERE client_id = ? AND user_name = ?')
    const r = stmt.get(clientId, this.userName)

    if (!r) return null
    return {
      clientId: r.client_id,
      key: r.key,
      deviceName: r.device_name,
      isMobile: !!r.is_mobile,
      lastConnectDate: r.last_connect_date,
    }
  }

  removeClientKeyInfo = async (clientId: string): Promise<void> => {
    const stmt = getDbStatement('DELETE FROM devices WHERE client_id = ? AND user_name = ?')
    stmt.run(clientId, this.userName)
  }

  isIncluedsClient = (clientId: string): boolean => {
    const stmt = getDbStatement<{ client_id: string }, [string, string]>(
      'SELECT client_id FROM devices WHERE client_id = ? AND user_name = ?'
    )
    const row = stmt.get(clientId, this.userName)
    return !!row
  }

  constructor(userName: string) {
    this.userName = userName
    this.userDir = path.join(global.lx.userPath, getUserDirname(userName))
  }
}
