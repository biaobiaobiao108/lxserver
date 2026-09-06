import fs from 'node:fs'
import path from 'node:path'
import { getDb } from './index'
import { getUserDirname } from '@/user/data'
import { File } from '@/constants'
import { startupLog } from '@/utils/log4js'

/**
 * 自动从现有 JSON 文件迁移数据到 SQLite 单库
 */
export const migrateFromJsonIfNecessary = async (): Promise<boolean> => {
  const db = getDb()

  // 1. 检查是否已经迁移过
  const row = db.query<{ value: string }, [string]>(
    'SELECT value FROM system_info WHERE key = ?'
  ).get('json_migrated')

  if (row?.value === '1') {
    return false
  }

  const dataPath = global.lx?.dataPath ?? path.join(process.cwd(), 'data')
  if (!fs.existsSync(dataPath)) {
    db.run('INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)', ['json_migrated', '1'])
    return false
  }

  startupLog.info('[DB Migration] Checking existing JSON data to migrate into SQLite...')
  const now = Date.now()

  // 开启事务进行全量迁移
  const migrationTx = db.transaction(() => {
    // A. 迁移 users.json
    const usersJsonPath = path.join(dataPath, 'users.json')
    if (fs.existsSync(usersJsonPath)) {
      try {
        const users = JSON.parse(fs.readFileSync(usersJsonPath, 'utf8'))
        if (Array.isArray(users)) {
          const insertUser = db.prepare(`INSERT OR REPLACE INTO users (name, password, max_snapshot_num, add_music_location_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
          for (const u of users) {
            insertUser.run(
              u.name,
              u.password,
              u.maxSnapshotNum ?? 10,
              u['list.addMusicLocationType'] ?? 'bottom',
              now,
              now
            )
          }
          startupLog.info(`[DB Migration] Migrated users from users.json`)
        }
      } catch (err) {
        console.error('[DB Migration] Failed to migrate users.json:', err)
      }
    }

    // B. 扫描各用户目录迁移 devices, snapshots, settings, tokens 等
    const userRoot = path.join(dataPath, File.userDir)
    if (fs.existsSync(userRoot)) {
      const userDirs = fs.readdirSync(userRoot)
      for (const dirName of userDirs) {
        const userDirPath = path.join(userRoot, dirName)
        if (!fs.statSync(userDirPath).isDirectory()) continue

        // 识别用户名
        let userName = dirName
        const devicesPath = path.join(userDirPath, File.userDevicesJSON)
        if (fs.existsSync(devicesPath)) {
          try {
            const devData = JSON.parse(fs.readFileSync(devicesPath, 'utf8'))
            if (devData.userName) userName = devData.userName

            // 写入设备密钥
            if (devData.clients && typeof devData.clients === 'object') {
              const insertDev = db.prepare(`INSERT OR REPLACE INTO devices (client_id, user_name, key, device_name, is_mobile, last_connect_date) VALUES (?, ?, ?, ?, ?, ?)`)
              for (const dev of Object.values(devData.clients) as any[]) {
                insertDev.run(
                  dev.clientId,
                  userName,
                  dev.key,
                  dev.deviceName || 'Unknown',
                  dev.isMobile ? 1 : 0,
                  dev.lastConnectDate || 0
                )
              }
            }
          } catch (err) {
            console.error(`[DB Migration] Failed to migrate devices`, err)
          }
        }

        // 确保 users 表中有该用户
        const existingUser = db.query('SELECT name FROM users WHERE name = ?').get(userName)
        if (!existingUser) {
          db.run(
            'INSERT OR IGNORE INTO users (name, password, max_snapshot_num, add_music_location_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [userName, '123456', 10, 'bottom', now, now]
          )
        }

        // 迁移歌单快照 (list)
        const listDir = path.join(userDirPath, File.listDir)
        if (fs.existsSync(listDir)) {
          const snapshotInfoPath = path.join(listDir, File.listSnapshotInfoJSON)
          let latestId: string | null = null
          if (fs.existsSync(snapshotInfoPath)) {
            try {
              const snapInfo = JSON.parse(fs.readFileSync(snapshotInfoPath, 'utf8'))
              latestId = snapInfo.latest || null
              if (snapInfo.clients && typeof snapInfo.clients === 'object') {
                const insertDevState = db.prepare(`INSERT OR REPLACE INTO device_snapshot_state (client_id, module, snapshot_key, last_sync_date) VALUES (?, ?, ?, ?)`)
                for (const [cid, sInfo] of Object.entries(snapInfo.clients) as any[]) {
                  insertDevState.run(cid, 'list', sInfo.snapshotKey || '', sInfo.lastSyncDate || 0)
                }
              }
            } catch { }
          }

          if (latestId) {
            db.run(
              'INSERT OR REPLACE INTO snapshot_meta (user_name, module, latest_id, updated_at) VALUES (?, ?, ?, ?)',
              [userName, 'list', latestId, now]
            )
          }

          // 扫描 snapshot_* 文件 (可能在 listDir 或 list/snapshot 下)
          const snapDirs = [listDir, path.join(listDir, File.listSnapshotDir)]
          const insertSnapshot = db.prepare(`INSERT OR REPLACE INTO snapshots (id, user_name, module, data, size, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
          for (const sDir of snapDirs) {
            if (!fs.existsSync(sDir)) continue
            const files = fs.readdirSync(sDir)
            for (const f of files) {
              if (!f.startsWith('snapshot_')) continue
              const snapId = f.replace('snapshot_', '')
              const fullSnapPath = path.join(sDir, f)
              try {
                const content = fs.readFileSync(fullSnapPath, 'utf8')
                const stat = fs.statSync(fullSnapPath)
                insertSnapshot.run(snapId, userName, 'list', content, stat.size, stat.mtimeMs)
              } catch (err) {
                console.error(`[DB Migration] Failed to read snapshot ${f}:`, err)
              }
            }
          }
        }

        // 迁移黑名单快照 (dislike)
        const dislikeDir = path.join(userDirPath, File.dislikeDir)
        if (fs.existsSync(dislikeDir)) {
          const dislikeSnapInfoPath = path.join(dislikeDir, File.dislikeSnapshotInfoJSON)
          let latestId: string | null = null
          if (fs.existsSync(dislikeSnapInfoPath)) {
            try {
              const snapInfo = JSON.parse(fs.readFileSync(dislikeSnapInfoPath, 'utf8'))
              latestId = snapInfo.latest || null
              if (snapInfo.clients && typeof snapInfo.clients === 'object') {
                const insertDevState = db.prepare(`INSERT OR REPLACE INTO device_snapshot_state (client_id, module, snapshot_key, last_sync_date) VALUES (?, ?, ?, ?)`)
                for (const [cid, sInfo] of Object.entries(snapInfo.clients) as any[]) {
                  insertDevState.run(cid, 'dislike', sInfo.snapshotKey || '', sInfo.lastSyncDate || 0)
                }
              }
            } catch { }
          }

          if (latestId) {
            db.run(
              'INSERT OR REPLACE INTO snapshot_meta (user_name, module, latest_id, updated_at) VALUES (?, ?, ?, ?)',
              [userName, 'dislike', latestId, now]
            )
          }

          const dislikeSnapDirs = [dislikeDir, path.join(dislikeDir, File.dislikeSnapshotDir)]
          const insertSnapshot = db.prepare(`INSERT OR REPLACE INTO snapshots (id, user_name, module, data, size, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
          for (const sDir of dislikeSnapDirs) {
            if (!fs.existsSync(sDir)) continue
            const files = fs.readdirSync(sDir)
            for (const f of files) {
              if (!f.startsWith('snapshot_')) continue
              const snapId = f.replace('snapshot_', '')
              const fullSnapPath = path.join(sDir, f)
              try {
                const content = fs.readFileSync(fullSnapPath, 'utf8')
                const stat = fs.statSync(fullSnapPath)
                insertSnapshot.run(snapId, userName, 'dislike', content, stat.size, stat.mtimeMs)
              } catch (err) {
                console.error(`[DB Migration] Failed to read dislike snapshot ${f}:`, err)
              }
            }
          }
        }

        // 迁移 user_settings (settings, sound_effects, tokens, library)
        const insertSetting = db.prepare(`INSERT OR REPLACE INTO user_settings (user_name, key, value, updated_at) VALUES (?, ?, ?, ?)`)

        const migrateSettingFile = (fileName: string, settingKey: string) => {
          const p = path.join(userDirPath, fileName)
          if (fs.existsSync(p)) {
            try {
              const content = fs.readFileSync(p, 'utf8')
              insertSetting.run(userName, settingKey, content, now)
            } catch { }
          }
        }

        migrateSettingFile(File.userSettingsJSON, 'settings')
        migrateSettingFile(File.userSoundEffectsJSON, 'sound_effects')
        migrateSettingFile(File.userTokensJSON, 'tokens')

        const libDir = path.join(userDirPath, 'library')
        if (fs.existsSync(libDir)) {
          const artistsPath = path.join(libDir, 'artists.json')
          if (fs.existsSync(artistsPath)) {
            try {
              insertSetting.run(userName, 'artists', fs.readFileSync(artistsPath, 'utf8'), now)
            } catch { }
          }
          const albumsPath = path.join(libDir, 'albums.json')
          if (fs.existsSync(albumsPath)) {
            try {
              insertSetting.run(userName, 'albums', fs.readFileSync(albumsPath, 'utf8'), now)
            } catch { }
          }
        }
      }
    }

    // C. 迁移缓存索引 (cache_index.json & music_index.json)
    const scanAndMigrateCacheIndex = (baseDir: string, location: string) => {
      if (!fs.existsSync(baseDir)) return
      for (const folder of ['cache', 'music'] as const) {
        const folderDir = path.join(baseDir, folder)
        if (!fs.existsSync(folderDir)) continue
        const userDirs = fs.readdirSync(folderDir)
        for (const uDir of userDirs) {
          const userDirPath = path.join(folderDir, uDir)
          if (!fs.statSync(userDirPath).isDirectory()) continue
          const indexFileName = folder === 'music' ? 'music_index.json' : 'cache_index.json'
          const indexPath = path.join(userDirPath, indexFileName)
          if (fs.existsSync(indexPath)) {
            try {
              const rawIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
              const insertCache = db.prepare(`INSERT OR REPLACE INTO cache_index (location, user_name, folder, song_id, quality, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
              for (const [compKey, item] of Object.entries(rawIndex) as any[]) {
                const songId = item.id || compKey.split('_')[0]
                const quality = item.quality || 'unknown'
                insertCache.run(location, uDir, folder, songId, quality, JSON.stringify(item), now)
              }
            } catch (err) {
              console.error(`[DB Migration] Failed to migrate index`, err)
            }
          }
        }
      }
    }

    scanAndMigrateCacheIndex(dataPath, 'data')
    scanAndMigrateCacheIndex(process.cwd(), 'root')

    // 标记迁移完成
    db.run('INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)', ['json_migrated', '1'])
  })

  migrationTx()
  startupLog.info('[DB Migration] JSON to SQLite migration finished successfully!')
  return true
}
