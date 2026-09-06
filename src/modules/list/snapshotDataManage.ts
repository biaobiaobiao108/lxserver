import { syncLog } from '@/utils/log4js'
import { getUserConfig, type UserDataManage } from '@/user/data'
import { getDb } from '@/database'

export interface SnapshotInfo {
  latest: string | null
  time: number
  list: string[]
  clients: Record<string, LX.Sync.List.ListInfo>
}

export class SnapshotDataManage {
  userDataManage: UserDataManage
  readonly module: string = 'list'

  clearOldSnapshot = async (): Promise<void> => {
    const db = getDb()
    const userMaxSnapshotNum = getUserConfig(this.userDataManage.userName).maxSnapshotNum

    // 查询设备正在使用的 snapshot_key 集合
    const deviceStates = db.query<{ snapshot_key: string }, [string, string]>(
      'SELECT snapshot_key FROM device_snapshot_state WHERE client_id IN (SELECT client_id FROM devices WHERE user_name = ?) AND module = ?'
    ).all(this.userDataManage.userName, this.module)
    const activeKeys = new Set(deviceStates.map(d => d.snapshot_key).filter(Boolean))

    // 获取所有快照按照创建时间倒序
    const allSnaps = db.query<{ id: string }, [string, string]>(
      'SELECT id FROM snapshots WHERE user_name = ? AND module = ? ORDER BY created_at DESC'
    ).all(this.userDataManage.userName, this.module)

    const unpinnedSnaps = allSnaps.filter(s => !activeKeys.has(s.id))
    if (unpinnedSnaps.length > userMaxSnapshotNum) {
      const toDelete = unpinnedSnaps.slice(userMaxSnapshotNum)
      const deleteStmt = db.prepare('DELETE FROM snapshots WHERE user_name = ? AND module = ? AND id = ?')
      for (const s of toDelete) {
        deleteStmt.run(this.userDataManage.userName, this.module, s.id)
      }
    }
  }

  updateDeviceSnapshotKey = async (clientId: string, key: string): Promise<void> => {
    const db = getDb()
    db.run(
      'INSERT OR REPLACE INTO device_snapshot_state (client_id, module, snapshot_key, last_sync_date) VALUES (?, ?, ?, ?)',
      [clientId, this.module, key, Date.now()]
    )
  }

  getDeviceCurrentSnapshotKey = async (clientId: string): Promise<string | undefined> => {
    const db = getDb()
    const row = db.query<{ snapshot_key: string }, [string, string]>(
      'SELECT snapshot_key FROM device_snapshot_state WHERE client_id = ? AND module = ?'
    ).get(clientId, this.module)
    return row?.snapshot_key
  }

  getSnapshotInfo = async (): Promise<SnapshotInfo> => {
    const db = getDb()

    // 1. 最新快照
    const metaRow = db.query<{ latest_id: string; updated_at: number }, [string, string]>(
      'SELECT latest_id, updated_at FROM snapshot_meta WHERE user_name = ? AND module = ?'
    ).get(this.userDataManage.userName, this.module)

    // 2. 快照 ID 列表 (倒序)
    const snapRows = db.query<{ id: string }, [string, string]>(
      'SELECT id FROM snapshots WHERE user_name = ? AND module = ? ORDER BY created_at DESC'
    ).all(this.userDataManage.userName, this.module)

    // 3. 各客户端状态
    const devRows = db.query<{ client_id: string; snapshot_key: string; last_sync_date: number }, [string, string]>(
      `SELECT dss.client_id, dss.snapshot_key, dss.last_sync_date
       FROM device_snapshot_state dss
       JOIN devices d ON d.client_id = dss.client_id
       WHERE d.user_name = ? AND dss.module = ?`
    ).all(this.userDataManage.userName, this.module)

    const clients: Record<string, LX.Sync.List.ListInfo> = {}
    for (const d of devRows) {
      clients[d.client_id] = {
        snapshotKey: d.snapshot_key,
        lastSyncDate: d.last_sync_date,
      }
    }

    return {
      latest: metaRow?.latest_id ?? null,
      time: metaRow?.updated_at ?? 0,
      list: snapRows.map(r => r.id),
      clients,
    }
  }

  saveSnapshotInfo = (info: SnapshotInfo): void => {
    const db = getDb()
    if (info.latest) {
      db.run(
        'INSERT OR REPLACE INTO snapshot_meta (user_name, module, latest_id, updated_at) VALUES (?, ?, ?, ?)',
        [this.userDataManage.userName, this.module, info.latest, info.time || Date.now()]
      )
    }
    void this.clearOldSnapshot()
  }

  removeSnapshotInfo = (clientId: string): void => {
    const db = getDb()
    db.run('DELETE FROM device_snapshot_state WHERE client_id = ? AND module = ?', [clientId, this.module])
  }

  getSnapshot = async (name: string): Promise<LX.Sync.List.ListData | null> => {
    const db = getDb()
    const row = db.query<{ data: string }, [string, string, string]>(
      'SELECT data FROM snapshots WHERE user_name = ? AND module = ? AND id = ?'
    ).get(this.userDataManage.userName, this.module, name)

    if (!row) return null
    try {
      return JSON.parse(row.data)
    } catch (err) {
      syncLog.warn(err)
      return null
    }
  }

  saveSnapshot = async (name: string, data: string): Promise<void> => {
    const db = getDb()
    const size = Buffer.byteLength(data, 'utf8')
    db.run(
      'INSERT OR REPLACE INTO snapshots (id, user_name, module, data, size, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [name, this.userDataManage.userName, this.module, data, size, Date.now()]
    )
  }

  saveSnapshotWithTime = async (name: string, data: string, time: number): Promise<void> => {
    const db = getDb()
    const size = Buffer.byteLength(data, 'utf8')
    db.run(
      'INSERT OR REPLACE INTO snapshots (id, user_name, module, data, size, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [name, this.userDataManage.userName, this.module, data, size, time || Date.now()]
    )
  }

  removeSnapshot = async (name: string): Promise<void> => {
    const db = getDb()
    db.run(
      'DELETE FROM snapshots WHERE user_name = ? AND module = ? AND id = ?',
      [this.userDataManage.userName, this.module, name]
    )
  }

  getSnapshotListWithMeta = async (): Promise<Array<{ id: string; time: number; size: number }>> => {
    const db = getDb()
    const rows = db.query<{ id: string; created_at: number; size: number }, [string, string]>(
      'SELECT id, created_at, size FROM snapshots WHERE user_name = ? AND module = ? ORDER BY created_at DESC'
    ).all(this.userDataManage.userName, this.module)

    return rows.map(r => ({
      id: r.id,
      time: r.created_at,
      size: r.size,
    }))
  }

  clearClients = (): void => {
    const db = getDb()
    db.run(
      'DELETE FROM device_snapshot_state WHERE module = ? AND client_id IN (SELECT client_id FROM devices WHERE user_name = ?)',
      [this.module, this.userDataManage.userName]
    )
  }

  setLatest = (name: string): void => {
    const db = getDb()
    db.run(
      'INSERT OR REPLACE INTO snapshot_meta (user_name, module, latest_id, updated_at) VALUES (?, ?, ?, ?)',
      [this.userDataManage.userName, this.module, name, Date.now()]
    )
  }

  constructor(userDataManage: UserDataManage) {
    this.userDataManage = userDataManage
  }
}
