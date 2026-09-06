import { Database } from 'bun:sqlite'
import path from 'node:path'
import fs from 'node:fs'

let dbInstance: Database | null = null

export const getDbPath = (): string => {
  const dataPath = global.lx?.dataPath ?? path.join(process.cwd(), 'data')
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true })
  }
  return path.join(dataPath, 'lxserver.db')
}

export const initDatabase = (customDbPath?: string): Database => {
  if (dbInstance) return dbInstance

  const dbPath = customDbPath ?? getDbPath()
  const db = new Database(dbPath, { create: true })

  // 启用 WAL 模式和外键支持
  db.run('PRAGMA journal_mode = WAL;')
  db.run('PRAGMA synchronous = NORMAL;')
  db.run('PRAGMA foreign_keys = ON;')

  // 1. 系统元信息表
  db.run(`
    CREATE TABLE IF NOT EXISTS system_info (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // 2. 用户账户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      name TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      max_snapshot_num INTEGER DEFAULT 10,
      add_music_location_type TEXT DEFAULT 'bottom',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  // Passwords remain in the runtime config for legacy protocol compatibility;
  // never persist them in the structured database.
  db.run("UPDATE users SET password = '' WHERE password <> ''")

  // 3. 设备密钥表
  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      client_id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      key TEXT NOT NULL,
      device_name TEXT NOT NULL,
      is_mobile INTEGER DEFAULT 0,
      last_connect_date INTEGER DEFAULT 0,
      FOREIGN KEY (user_name) REFERENCES users(name) ON DELETE CASCADE
    );
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_name);')

  // 4. 快照数据表 (歌单、黑名单)
  db.run(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      module TEXT NOT NULL,
      data TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_name, module, id)
    );
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_snapshots_lookup ON snapshots(user_name, module, created_at DESC);')

  // 5. 快照元信息表 (记录最新快照)
  db.run(`
    CREATE TABLE IF NOT EXISTS snapshot_meta (
      user_name TEXT NOT NULL,
      module TEXT NOT NULL,
      latest_id TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_name, module)
    );
  `)

  // 6. 客户端当前快照状态
  db.run(`
    CREATE TABLE IF NOT EXISTS device_snapshot_state (
      client_id TEXT NOT NULL,
      module TEXT NOT NULL,
      snapshot_key TEXT NOT NULL,
      last_sync_date INTEGER NOT NULL,
      PRIMARY KEY (client_id, module)
    );
  `)

  // 7. 用户设置与偏好表 (扩展配置、音效、曲库等)
  db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_name TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_name, key)
    );
  `)

  // 8. 缓存与下载元数据索引表
  db.run(`
    CREATE TABLE IF NOT EXISTS cache_index (
      location TEXT NOT NULL,
      user_name TEXT NOT NULL,
      folder TEXT NOT NULL,
      song_id TEXT NOT NULL,
      quality TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (location, user_name, folder, song_id, quality)
    );
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_cache_query ON cache_index(location, user_name, folder, song_id);')

  dbInstance = db
  stmtCache.clear()
  return db
}

const stmtCache = new Map<string, any>()

/**
 * 获取或缓存已预编译的 SQLite Statement，避免高频调用时的重复 SQL 词法解析与编译开销
 */
export const getDbStatement = <T = any, Params extends any[] = any[]>(sql: string): any => {
  const db = getDb()
  let stmt = stmtCache.get(sql)
  if (!stmt) {
    stmt = (db as any).prepare(sql)
    stmtCache.set(sql, stmt)
  }
  return stmt
}

export const getDb = (): Database => {
  if (!dbInstance) {
    return initDatabase()
  }
  return dbInstance
}

export const closeDb = (): void => {
  if (dbInstance) {
    stmtCache.clear()
    dbInstance.close()
    dbInstance = null
  }
}
