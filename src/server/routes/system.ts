import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import needle from 'needle'
import formidable from 'formidable'
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

  // 1.1 详细系统状态 /api/status
  router.get('/api/status', (ctx) => {
    if (!verifyAdminAuth(ctx.request)) {
      return ctx.text('Unauthorized', 401)
    }

    const totalMem = os.totalmem()
    const freeMem = os.freemem()

    const getSystemCpuUsage = () => {
      const cpus = os.cpus()
      let idle = 0
      let total = 0
      cpus.forEach(cpu => {
        for (const type in cpu.times) { total += (cpu.times as any)[type] }
        idle += cpu.times.idle
      })
      const last = (global.lx as any).lastCpuSample || { idle: 0, total: 0 }
      const deltaIdle = idle - last.idle
      const deltaTotal = total - last.total
      ;(global.lx as any).lastCpuSample = { idle, total }
      if (deltaTotal === 0) return '0.00'
      return (100 * (1 - deltaIdle / deltaTotal)).toFixed(2)
    }

    const getProcessCpuUsage = () => {
      const currentUsage = process.cpuUsage()
      const currentTime = Date.now()
      const last = (global.lx as any).lastProcessSample || { cpu: process.cpuUsage(), time: Date.now() - 100 }
      const deltaUsage = {
        user: currentUsage.user - last.cpu.user,
        system: currentUsage.system - last.cpu.system,
      }
      const deltaTime = (currentTime - last.time) * 1000
      ;(global.lx as any).lastProcessSample = { cpu: currentUsage, time: currentTime }
      if (deltaTime === 0) return '0.00'
      return ((deltaUsage.user + deltaUsage.system) / deltaTime / os.cpus().length * 100).toFixed(2)
    }

    const status = {
      users: global.lx.config.users.length,
      devices: serverStatus.devices.length,
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      totalMemory: totalMem,
      freeMemory: freeMem,
      systemMemoryUsage: ((totalMem - freeMem) / totalMem * 100).toFixed(2),
      processMemoryUsage: (process.memoryUsage().rss / totalMem * 100).toFixed(2),
      cpuUsage: getSystemCpuUsage(),
      processCpuUsage: getProcessCpuUsage(),
      osUptime: os.uptime(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      cpuSpeed: os.cpus()[0]?.speed || 0,
      isWebDAVConfigured: !!(global.lx.config['webdav.url'] && global.lx.config['webdav.url'].trim() !== ''),
    }

    return ctx.json(status)
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

      // WebDAV 配置
      if (newConfig['webdav.enable'] !== undefined) c['webdav.enable'] = newConfig['webdav.enable']
      if (newConfig['webdav.url'] !== undefined) c['webdav.url'] = newConfig['webdav.url']
      if (newConfig['webdav.username'] !== undefined) c['webdav.username'] = newConfig['webdav.username']
      if (newConfig['webdav.password'] !== undefined) c['webdav.password'] = newConfig['webdav.password']
      if (newConfig['webdav.syncPath'] !== undefined) c['webdav.syncPath'] = newConfig['webdav.syncPath']
      if (newConfig['webdav.backupPath'] !== undefined) c['webdav.backupPath'] = newConfig['webdav.backupPath']
      if (newConfig['sync.interval'] !== undefined) c['sync.interval'] = parseInt(newConfig['sync.interval'])
      if (newConfig['sync.backupInterval'] !== undefined) c['sync.backupInterval'] = parseInt(newConfig['sync.backupInterval']) || 24
      if (newConfig['proxy.all.enabled'] !== undefined) c['proxy.all.enabled'] = newConfig['proxy.all.enabled']
      if (newConfig['proxy.all.address'] !== undefined) c['proxy.all.address'] = newConfig['proxy.all.address']

      if (newConfig['admin.path'] !== undefined || newConfig['player.path'] !== undefined) {
        const adminPath = (newConfig['admin.path'] !== undefined ? newConfig['admin.path'] : (c['admin.path'] ?? ''))
        const playerPath = (newConfig['player.path'] !== undefined ? newConfig['player.path'] : (c['player.path'] ?? '/music'))
        const normalizedAdmin = adminPath.replace(/\/+$/, '')
        const normalizedPlayer = playerPath.replace(/\/+$/, '')

        if (!playerPath || !playerPath.startsWith('/')) {
          return ctx.json({ success: false, error: '播放器路径不能为空且必须以 / 开头' }, 422)
        }
        if (normalizedAdmin !== '' && !normalizedAdmin.startsWith('/')) {
          return ctx.json({ success: false, error: '后台路径必须以 / 开头或为空' }, 422)
        }
        if ((normalizedAdmin || '/') === (normalizedPlayer || '/')) {
          return ctx.json({ success: false, error: '后台管理路径与播放器路径不能相同' }, 422)
        }
        if (normalizedAdmin.startsWith('/api') || normalizedPlayer.startsWith('/api')) {
          return ctx.json({ success: false, error: '路径不能以 /api 开头' }, 422)
        }
        c['admin.path'] = normalizedAdmin
        c['player.path'] = normalizedPlayer
      }

      if (newConfig['subsonic.enable'] !== undefined) c['subsonic.enable'] = newConfig['subsonic.enable']
      if (newConfig['subsonic.path'] !== undefined) {
        c['subsonic.path'] = newConfig['subsonic.path'].replace(/\/+$/, '') || '/rest'
      }
      if (newConfig['subsonic.enableDebug'] !== undefined) c['subsonic.enableDebug'] = newConfig['subsonic.enableDebug']
      if (newConfig['subsonic.onlineSearch'] !== undefined) c['subsonic.onlineSearch'] = newConfig['subsonic.onlineSearch']
      if (newConfig['subsonic.onlineSearchMode'] !== undefined) c['subsonic.onlineSearchMode'] = newConfig['subsonic.onlineSearchMode']
      if (newConfig['subsonic.onlineSearchSources'] !== undefined) c['subsonic.onlineSearchSources'] = newConfig['subsonic.onlineSearchSources']
      if (newConfig['subsonic.lyricTranslation'] !== undefined) c['subsonic.lyricTranslation'] = newConfig['subsonic.lyricTranslation']
      if (newConfig['singer.sourcePriority'] !== undefined) {
        const priority = String(newConfig['singer.sourcePriority']).split(',').filter(s => s === 'tx' || s === 'wy') as Array<'tx' | 'wy'>
        if (priority.length > 0) c['singer.sourcePriority'] = priority
      }
      if (newConfig['artist.maxFetchPages'] !== undefined) {
        const maxPages = Number(newConfig['artist.maxFetchPages'])
        c['artist.maxFetchPages'] = Number.isFinite(maxPages) && maxPages > 0 ? Math.min(Math.floor(maxPages), 100) : 20
      }

      if (global.lx.webdavSync && (newConfig['webdav.enable'] !== undefined || newConfig['webdav.url'] || newConfig['webdav.username'] || newConfig['webdav.password'] || newConfig['webdav.syncPath'] || newConfig['webdav.backupPath'] || newConfig['sync.interval'] || newConfig['sync.backupInterval'])) {
        global.lx.webdavSync.updateConfig({
          enable: c['webdav.enable'],
          url: c['webdav.url'],
          username: c['webdav.username'],
          password: c['webdav.password'],
          syncPath: c['webdav.syncPath'],
          backupPath: c['webdav.backupPath'],
          interval: c['sync.interval'],
          backupInterval: c['sync.backupInterval'],
        })
      }

      let warning = ''
      if (!c['user.enablePath'] && !c['user.enableRoot']) {
        c['user.enableRoot'] = true
        warning = '必须至少开启一种连接方式，已自动开启“根路径”模式。'
      }

      if (global.lx.saveConfig) await global.lx.saveConfig()
      if (global.lx.webdavSync && global.lx.webdavSync.isConfigured()) {
        void global.lx.webdavSync.syncChangedFiles()
      }

      return ctx.json({ success: true, warning })
    } catch (e: any) {
      return ctx.json({ success: false, error: e.message }, 500)
    }
  })

  // 3.1 测试代理
  router.post('/api/config/test-proxy', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    try {
      const { address } = await ctx.bodyJson<{ address?: string }>()
      if (!address) throw new Error('Missing address')
      const url = new URL(address)
      const options: any = {
        timeout: 10000,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        },
      }

      if (url.protocol === 'http:' || url.protocol === 'https:') {
        options.proxy = address
      } else if (url.protocol.startsWith('socks')) {
        const { SocksProxyAgent } = await import('socks-proxy-agent')
        options.agent = new SocksProxyAgent(address)
      } else {
        throw new Error('Unsupported protocol: ' + url.protocol)
      }

      const startTime = Date.now()
      return await new Promise<Response>((resolve) => {
        needle.get('https://www.baidu.com', options, (err: Error | null, resp: any) => {
          const duration = Date.now() - startTime
          if (err) {
            resolve(ctx.json({ success: false, message: err.message }))
          } else {
            resolve(ctx.json({ success: true, message: `连接成功 (状态码: ${resp.statusCode}, 耗时: ${duration}ms)` }))
          }
        })
      })
    } catch (err: any) {
      return ctx.json({ success: false, message: err.message })
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
    return ctx.json({ success: true, logs: webdavSync.getSyncLogs() })
  })

  // 5.1 本地备份下载与上传
  router.get('/api/backup/download', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    try {
      const webdavSync = global.lx.webdavSync
      if (!webdavSync) throw new Error('Backup system not initialized')
      const zipName = await webdavSync.createBackup()
      if (!zipName) throw new Error('Backup creation failed')
      const zipPath = path.join(global.lx.dataPath, zipName)
      if (!fs.existsSync(zipPath)) throw new Error('ZIP file not found')
      const bunFile = Bun.file(zipPath)
      setTimeout(() => {
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
      }, 10000)
      return new Response(bunFile, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${zipName}"`,
        },
      })
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  // 6. 本地文件管理接口 (/api/files*)
  router.get('/api/files', (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    const dirPath = ctx.query.get('path') || ''
    const resolvedRoot = path.resolve(global.lx.dataPath)
    const fullPath = path.resolve(global.lx.dataPath, dirPath)
    if (!fullPath.startsWith(resolvedRoot + path.sep) && fullPath !== resolvedRoot) {
      return ctx.text('Forbidden', 403)
    }

    try {
      const items = fs.readdirSync(fullPath).map((name) => {
        const itemPath = path.join(fullPath, name)
        const stat = fs.statSync(itemPath)
        return {
          name,
          path: path.relative(global.lx.dataPath, itemPath),
          isDirectory: stat.isDirectory(),
          size: stat.size,
          mtime: stat.mtime.getTime(),
        }
      })
      return ctx.json({ items })
    } catch (err: any) {
      return ctx.json({ error: err.message }, 500)
    }
  })

  router.get('/api/files/download', (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    const filePath = ctx.query.get('path') || ''
    const resolvedRoot = path.resolve(global.lx.dataPath)
    const fullPath = path.resolve(global.lx.dataPath, filePath)
    if (!fullPath.startsWith(resolvedRoot + path.sep) && fullPath !== resolvedRoot) {
      return ctx.text('Forbidden', 403)
    }
    if (!fs.existsSync(fullPath)) return ctx.text('File not found', 404)
    return new Response(Bun.file(fullPath), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${path.basename(fullPath)}"`,
      },
    })
  })

  router.post('/api/files', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    try {
      const { path: filePath, content, isDirectory } = await ctx.bodyJson<{ path?: string; content?: string; isDirectory?: boolean }>()
      const resolvedRoot = path.resolve(global.lx.dataPath)
      const fullPath = path.resolve(global.lx.dataPath, filePath || '')
      if (!fullPath.startsWith(resolvedRoot + path.sep) && fullPath !== resolvedRoot) {
        return ctx.text('Forbidden', 403)
      }
      if (isDirectory) {
        fs.mkdirSync(fullPath, { recursive: true })
      } else {
        const dir = path.dirname(fullPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(fullPath, content || '')
      }
      return ctx.json({ success: true })
    } catch (err: any) {
      return ctx.json({ success: false, message: err.message }, 500)
    }
  })

  router.delete('/api/files', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    try {
      const { path: filePath } = await ctx.bodyJson<{ path?: string }>()
      const resolvedRoot = path.resolve(global.lx.dataPath)
      const fullPath = path.resolve(global.lx.dataPath, filePath || '')
      if (!fullPath.startsWith(resolvedRoot + path.sep) && fullPath !== resolvedRoot) {
        return ctx.text('Forbidden', 403)
      }
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true })
      } else {
        fs.unlinkSync(fullPath)
      }
      return ctx.json({ success: true })
    } catch (err: any) {
      return ctx.json({ success: false, message: err.message }, 500)
    }
  })

  return router
}
