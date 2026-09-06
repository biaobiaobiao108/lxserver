import fs from 'node:fs'
import path from 'node:path'
import { Router, type HttpContext } from '../core'
import { verifyAdminAuth } from '../auth'
import { serverStatus } from '../state'
import { startupLog } from '@/utils/log4js'
import { getUserDirname } from '@/user'

/** 重新加载服务器运行时数据 */
export const reloadServerData = async (): Promise<void> => {
  startupLog.info('Hot-reloading server data (users and config)...')
  const configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'config.js')
  if (fs.existsSync(configPath)) {
    try {
      delete require.cache[require.resolve(configPath)]
      const rootConfig = require(configPath)
      for (const key of Object.keys(rootConfig)) {
        if (key !== 'users') {
          ;(global.lx.config as any)[key] = rootConfig[key]
        }
      }
      if (global.lx.webdavSync) {
        global.lx.webdavSync.updateConfig({
          url: global.lx.config['webdav.url'],
          username: global.lx.config['webdav.username'],
          password: global.lx.config['webdav.password'],
          syncPath: global.lx.config['webdav.syncPath'],
          backupPath: global.lx.config['webdav.backupPath'],
          interval: global.lx.config['sync.interval'],
          backupInterval: global.lx.config['sync.backupInterval'],
        })
      }
      startupLog.info('Config.js re-loaded and merged.')
    } catch (err: any) {
      startupLog.error('Failed to reload config.js:', err.message)
    }
  }

  const usersJsonPath = path.join(global.lx.dataPath, 'users.json')
  if (fs.existsSync(usersJsonPath)) {
    try {
      const usersRaw = fs.readFileSync(usersJsonPath, 'utf-8')
      const users = JSON.parse(usersRaw)
      if (Array.isArray(users)) {
        global.lx.config.users = users.map(u => ({
          ...u,
          dataPath: path.join(global.lx.userPath, getUserDirname(u.name)),
        }))
        for (const user of global.lx.config.users) {
          if (!fs.existsSync(user.dataPath)) {
            fs.mkdirSync(user.dataPath, { recursive: true })
          }
        }
      }
    } catch (err: any) {
      startupLog.error('Failed to reload users.json:', err.message)
    }
  }
}

/** 注册系统运维与管理相关路由 */
export const createSystemRouter = (): Router => {
  const router = new Router()

  // 1. 服务运行统计 (CPU/内存/设备数/状态)
  router.get('/api/stats', (ctx) => {
    if (!verifyAdminAuth(ctx.request)) {
      return ctx.text('Unauthorized', 401)
    }
    const stats = {
      users: global.lx.config.users?.length ?? 0,
      connectedDevices: serverStatus.devices.length,
      serverStatus: serverStatus.status,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    }
    return ctx.json(stats)
  })

  // 2. 日志读取
  router.get('/api/logs', (ctx) => {
    if (!verifyAdminAuth(ctx.request)) {
      return ctx.text('Unauthorized', 401)
    }
    const logType = ctx.query.get('type') || 'access'
    const fileName = logType === 'error' ? 'error.log' : 'access.log'
    const logFilePath = path.join(global.lx.logPath || path.join(process.cwd(), 'logs'), fileName)

    if (!fs.existsSync(logFilePath)) {
      return ctx.json({ lines: [] })
    }
    try {
      const content = fs.readFileSync(logFilePath, 'utf8')
      const lines = content.split('\n').filter(Boolean)
      const last100 = lines.slice(-100)
      return ctx.json({ lines: last100 })
    } catch (e: any) {
      return ctx.json({ error: e.message }, 500)
    }
  })

  // 3. 配置读取与更新 (GET & POST)
  router.get('/api/config', (ctx) => {
    if (!verifyAdminAuth(ctx.request)) {
      return ctx.text('Unauthorized', 401)
    }
    const c = global.lx.config
    const config = {
      serverName: c.serverName,
      maxSnapshotNum: c.maxSnapshotNum,
      'list.addMusicLocationType': c['list.addMusicLocationType'],
      'proxy.enabled': c['proxy.enabled'],
      'proxy.header': c['proxy.header'],
      'user.enablePath': c['user.enablePath'],
      'user.enableRoot': c['user.enableRoot'],
      'user.enablePublicRestriction': c['user.enablePublicRestriction'],
      'user.enablePublicNonAdminLocalMusic': c['user.enablePublicNonAdminLocalMusic'],
      'user.enablePublicFavorites': c['user.enablePublicFavorites'],
      'user.enablePublicNonAdminAccess': c['user.enablePublicNonAdminAccess'],
      'user.enableLoginCacheRestriction': c['user.enableLoginCacheRestriction'],
      'user.enableCacheSizeLimit': c['user.enableCacheSizeLimit'],
      'user.cacheSizeLimit': c['user.cacheSizeLimit'],
      'frontend.password': c['frontend.password'],
      'player.enableAuth': c['player.enableAuth'] || false,
      'player.password': c['player.password'] || '',
      'webdav.enable': c['webdav.enable'] ?? false,
      'webdav.url': c['webdav.url'] || '',
      'webdav.username': c['webdav.username'] || '',
      'webdav.password': c['webdav.password'] || '',
      'webdav.syncPath': c['webdav.syncPath'] || '/lx-sync',
      'webdav.backupPath': c['webdav.backupPath'] || '/lx-sync-backups',
      'sync.interval': c['sync.interval'] || 60,
      'sync.backupInterval': c['sync.backupInterval'] || 24,
      'proxy.all.enabled': c['proxy.all.enabled'] || false,
      'proxy.all.address': c['proxy.all.address'] || '',
      'admin.path': c['admin.path'] ?? '',
      'player.path': c['player.path'] ?? '/music',
      'subsonic.enable': c['subsonic.enable'] ?? true,
      'subsonic.path': c['subsonic.path'] ?? '/rest',
      'subsonic.enableDebug': c['subsonic.enableDebug'] ?? true,
      'subsonic.onlineSearch': c['subsonic.onlineSearch'] ?? true,
      'subsonic.onlineSearchMode': c['subsonic.onlineSearchMode'] ?? 'fallback',
      'subsonic.onlineSearchSources': c['subsonic.onlineSearchSources'] ?? 'wy,tx,kw,kg,mg',
      'subsonic.lyricTranslation': c['subsonic.lyricTranslation'] ?? true,
      'singer.sourcePriority': (c['singer.sourcePriority'] || ['tx', 'wy']).join(','),
      'artist.maxFetchPages': c['artist.maxFetchPages'] ?? 20,
      'system.allowUnsafeVM': c['system.allowUnsafeVM'] || false,
    }
    return ctx.json(config)
  })

  router.post('/api/config', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) {
      return ctx.text('Unauthorized', 401)
    }
    try {
      const newConfig = await ctx.bodyJson<Record<string, any>>()
      const c = global.lx.config
      if (newConfig.serverName !== undefined) c.serverName = newConfig.serverName
      if (newConfig.maxSnapshotNum !== undefined) c.maxSnapshotNum = parseInt(newConfig.maxSnapshotNum)
      if (newConfig['list.addMusicLocationType'] !== undefined) c['list.addMusicLocationType'] = newConfig['list.addMusicLocationType']
      if (newConfig['proxy.enabled'] !== undefined) c['proxy.enabled'] = newConfig['proxy.enabled']
      if (newConfig['proxy.header'] !== undefined) c['proxy.header'] = newConfig['proxy.header']
      if (newConfig['user.enablePath'] !== undefined) c['user.enablePath'] = newConfig['user.enablePath']
      if (newConfig['user.enableRoot'] !== undefined) c['user.enableRoot'] = newConfig['user.enableRoot']
      if (newConfig['user.enablePublicRestriction'] !== undefined) c['user.enablePublicRestriction'] = newConfig['user.enablePublicRestriction']
      if (newConfig['user.enablePublicNonAdminLocalMusic'] !== undefined) c['user.enablePublicNonAdminLocalMusic'] = newConfig['user.enablePublicNonAdminLocalMusic']
      if (newConfig['user.enablePublicFavorites'] !== undefined) c['user.enablePublicFavorites'] = newConfig['user.enablePublicFavorites']
      if (newConfig['user.enablePublicNonAdminAccess'] !== undefined) c['user.enablePublicNonAdminAccess'] = newConfig['user.enablePublicNonAdminAccess']
      if (newConfig['user.enableLoginCacheRestriction'] !== undefined) c['user.enableLoginCacheRestriction'] = newConfig['user.enableLoginCacheRestriction']
      if (newConfig['user.enableCacheSizeLimit'] !== undefined) c['user.enableCacheSizeLimit'] = newConfig['user.enableCacheSizeLimit']
      if (newConfig['user.cacheSizeLimit'] !== undefined) c['user.cacheSizeLimit'] = parseInt(newConfig['user.cacheSizeLimit']) || 2000
      if (newConfig['system.allowUnsafeVM'] !== undefined) c['system.allowUnsafeVM'] = newConfig['system.allowUnsafeVM']
      if (newConfig['frontend.password'] !== undefined) c['frontend.password'] = newConfig['frontend.password']
      if (newConfig['player.enableAuth'] !== undefined) c['player.enableAuth'] = newConfig['player.enableAuth']
      if (newConfig['player.password'] !== undefined) c['player.password'] = newConfig['player.password']

      if (global.lx.saveConfig) await global.lx.saveConfig()
      return ctx.json({ success: true })
    } catch (e: any) {
      return ctx.json({ success: false, error: e.message }, 500)
    }
  })

  // 4. 重启与热重载
  router.post('/api/admin/reload', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) {
      return ctx.text('Unauthorized', 401)
    }
    await reloadServerData()
    return ctx.json({ success: true, message: 'Server data reloaded' })
  })

  router.post('/api/restart', (ctx) => {
    if (!verifyAdminAuth(ctx.request)) {
      return ctx.text('Unauthorized', 401)
    }
    setTimeout(() => {
      process.exit(0)
    }, 500)
    return ctx.json({ success: true, message: 'Server is restarting...' })
  })

  // 5. WebDAV 交互
  router.post('/api/webdav/test', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    const webdavSync = global.lx.webdavSync
    if (!webdavSync) return ctx.json({ success: false, message: 'WebDAV not initialized' }, 500)
    const result = await webdavSync.testConnection()
    return ctx.json(result)
  })

  router.post('/api/webdav/backup', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    const webdavSync = global.lx.webdavSync
    if (!webdavSync) return ctx.json({ success: false, message: 'WebDAV not initialized' }, 500)
    const body = await ctx.bodyJson<{ force?: boolean }>().catch(() => ({} as { force?: boolean }))
    const success = await webdavSync.uploadBackup(body.force)
    return ctx.json({ success })
  })

  router.post('/api/webdav/sync', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    const webdavSync = global.lx.webdavSync
    if (!webdavSync) return ctx.json({ success: false, message: 'WebDAV not initialized' }, 500)
    const success = await webdavSync.syncAllFiles()
    return ctx.json({ success })
  })

  router.post('/api/webdav/restore', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    const webdavSync = global.lx.webdavSync
    if (!webdavSync) return ctx.json({ success: false, message: 'WebDAV not initialized' }, 500)
    const success = await webdavSync.restoreFromRemote()
    if (success) await reloadServerData()
    return ctx.json({ success })
  })

  router.get('/api/webdav/logs', (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    const webdavSync = global.lx.webdavSync
    if (!webdavSync) return ctx.json({ success: false, message: 'WebDAV not initialized' }, 500)
    return ctx.json({ success: true, logs: webdavSync.getLogs() })
  })

  router.get('/api/webdav/progress', (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    const webdavSync = global.lx.webdavSync
    if (!webdavSync) return ctx.json({ success: false, message: 'WebDAV not initialized' }, 500)
    return ctx.json({ success: true, progress: webdavSync.getProgress() })
  })

  return router
}
