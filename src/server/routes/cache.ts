import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { Router, type HttpContext } from '../core'
import { verifyAdminAuth } from '../auth'
import { verifyUserAuth } from './auth'
import * as fileCache from '../fileCache'
import * as serverDownloadQueue from '../serverDownloadQueue'
import * as remasterQueue from '../remasterQueue'
// @ts-ignore
import musicSdkRaw from '@/modules/utils/musicSdk/index.js'
const musicSdk = musicSdkRaw as any
import { accessLog } from '@/utils/log4js'

const { MusicTagger, MetaPicture } = require('music-tag-native')

/** 辅助获取缓存与下载任务的目标用户名 */
const getCacheRequestUsername = (ctx: HttpContext): string | null => {
  const requested = ctx.headers.get('x-user-name') || ''
  if (!requested || requested === 'default' || requested === 'open' || requested === '_open') return '_open'
  return verifyUserAuth(ctx)
}

/** 注册本地音乐缓存、下载队列、洗版与文件分发路由 */
export const createCacheRouter = (): Router => {
  const router = new Router()

  // 1. 本地音乐洗版 Remaster APIs
  router.post('/api/music/remaster/start', async (ctx) => {
    const username = getCacheRequestUsername(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    try {
      const body = await ctx.bodyJson<{ targetQuality?: string; filenames?: string[] }>()
      const data = await remasterQueue.start(username, String(body?.targetQuality || ''), body?.filenames)
      return ctx.json({ success: true, data })
    } catch (err: any) {
      return ctx.json({ success: false, message: err?.message || '启动洗版失败' }, 400)
    }
  })

  router.get('/api/music/remaster/status', (ctx) => {
    const username = getCacheRequestUsername(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    const offset = Number(ctx.query.get('offset') || 0)
    const limit = Number(ctx.query.get('limit') || 200)
    const data = remasterQueue.getStatus(username, offset, limit)
    return ctx.json({ success: true, data })
  })

  router.post('/api/music/remaster/cancel', (ctx) => {
    const username = getCacheRequestUsername(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    const cancelled = remasterQueue.cancel(username)
    return ctx.json({ success: true, data: { cancelled } })
  })

  // 2. 缓存基础配置与索引同步
  router.post('/api/music/cache/config', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    }

    try {
      const { location, namingPattern } = await ctx.bodyJson<{ location?: string; namingPattern?: string }>()
      let updated = false

      if (location) {
        if (location !== fileCache.getCacheLocation()) {
          const config = (global.lx?.config ?? {}) as any
          if (isPublic && config['user.enablePublicRestriction']) {
            if (!verifyAdminAuth(ctx.request)) {
              return ctx.json({ success: false, error: '权限不足：公共用户修改缓存位置受限，请输入管理员密码。' }, 403)
            }
          }
          fileCache.setCacheLocation(location)
          updated = true
        }
      }

      if (namingPattern) {
        const normalizedNamingPattern = fileCache.setNamingPattern(namingPattern)
        if (global.lx.config) global.lx.config['cache.namingPattern'] = normalizedNamingPattern
        updated = true
      }

      if (updated) {
        return ctx.json({ success: true })
      }
      return ctx.json({ success: true, message: 'No changes' })
    } catch {
      return ctx.text('Error', 500)
    }
  })

  router.post('/api/music/cache/sync', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }

    try {
      await fileCache.syncCacheIndex(username)
      return ctx.json({ success: true, message: 'Sync completed' })
    } catch (e: any) {
      return ctx.json({ success: false, message: 'Sync failed: ' + e.message }, 500)
    }
  })

  router.get('/api/music/cache/subdirs', (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ctx.query.get('user') || ''
    const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }
    const folder = (ctx.query.get('folder') as 'cache' | 'music') || 'music'
    const subdirs = fileCache.getSubDirectories(username, folder)
    return ctx.json({ success: true, data: subdirs })
  })

  router.post('/api/music/cache/mkdir', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }
    try {
      const { folder, subPath } = await ctx.bodyJson<{ folder?: fileCache.CacheFolder; subPath?: string }>()
      if (!folder || !subPath) return ctx.text('Missing params', 400)
      const success = fileCache.createSubDirectory(username, folder, subPath)
      return ctx.json({ success })
    } catch {
      return ctx.text('Error', 500)
    }
  })

  router.post('/api/music/cache/categorize', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }
    try {
      const { filenames, subPath } = await ctx.bodyJson<{ filenames?: string[]; subPath?: string }>()
      if (!Array.isArray(filenames) || typeof subPath !== 'string') return ctx.text('Missing params', 400)
      const result = await fileCache.categorizeFiles(filenames, subPath, username)
      return ctx.json({ success: true, ...result })
    } catch {
      return ctx.text('Error', 500)
    }
  })

  router.post('/api/music/cache/rename', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }
    try {
      const result = await fileCache.batchRenameCacheFiles(username)
      return ctx.json(result)
    } catch (e: any) {
      return ctx.json({ success: false, message: 'Rename failed: ' + e.message }, 500)
    }
  })

  // 3. 缓存命中检查
  router.get('/api/music/cache/check', (ctx) => {
    const name = ctx.query.get('name')
    const singer = ctx.query.get('singer')
    const source = ctx.query.get('source')
    const songmid = ctx.query.get('songmid')
    const songId = ctx.query.get('songId')
    const quality = ctx.query.get('quality')
    const exactQuality = ctx.query.get('exactQuality') === '1' || ctx.query.get('exactQuality') === 'true'

    if (!name || !singer || !source || (!songmid && !songId)) {
      return ctx.text('Missing params', 400)
    }

    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }

    const result = fileCache.checkCache({ name, singer, source, songmid, songId, quality, exactQuality }, username)
    if (result && result.exists && username !== '_open' && username !== 'default') {
      const token = ctx.headers.get('x-user-token')
      if (token) {
        result.url += `&token=${encodeURIComponent(token)}`
      }
    }
    return ctx.json(result)
  })

  // 4. 服务端持久化下载队列
  router.get('/api/music/cache/queue', (ctx) => {
    const username = getCacheRequestUsername(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    return ctx.json({ success: true, data: serverDownloadQueue.list(username) })
  })

  router.post('/api/music/cache/queue', async (ctx) => {
    const username = getCacheRequestUsername(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    try {
      const { tasks, namingPattern, concurrency } = await ctx.bodyJson<{
        tasks?: any[]
        namingPattern?: string
        concurrency?: number
      }>()
      if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('Missing tasks')
      if (concurrency !== undefined) serverDownloadQueue.setConcurrency(username, concurrency)
      if (namingPattern) {
        if (!verifyAdminAuth(ctx.request)) throw new Error('Unauthorized to change cache naming pattern')
        const normalizedNamingPattern = fileCache.setNamingPattern(namingPattern)
        if (global.lx.config) global.lx.config['cache.namingPattern'] = normalizedNamingPattern
      }
      const queued = serverDownloadQueue.enqueue(username, tasks)
      return ctx.json({ success: true, data: queued })
    } catch (err: any) {
      return ctx.json({ success: false, message: err.message || 'Invalid queue request' }, 400)
    }
  })

  router.post('/api/music/cache/queue/concurrency', async (ctx) => {
    const username = getCacheRequestUsername(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    try {
      const { concurrency } = await ctx.bodyJson<{ concurrency?: number }>()
      const savedConcurrency = serverDownloadQueue.setConcurrency(username, concurrency)
      return ctx.json({ success: true, data: { concurrency: savedConcurrency } })
    } catch (err: any) {
      return ctx.json({ success: false, message: err.message || 'Invalid concurrency' }, 400)
    }
  })

  router.post('/api/music/cache/queue/resume', async (ctx) => {
    const username = getCacheRequestUsername(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    try {
      const { id, all } = await ctx.bodyJson<{ id?: string; all?: boolean }>()
      if (all !== true && !id) throw new Error('Missing queue task id')
      serverDownloadQueue.resume(username, all ? undefined : id)
      return ctx.json({ success: true })
    } catch (err: any) {
      return ctx.json({ success: false, message: err.message }, 400)
    }
  })

  router.post('/api/music/cache/queue/remove', async (ctx) => {
    const username = getCacheRequestUsername(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    try {
      const options = await ctx.bodyJson<{ id?: string; all?: boolean; completed?: boolean }>()
      if (!options || (options.all !== true && options.completed !== true && !options.id)) {
        throw new Error('Missing queue removal option')
      }
      serverDownloadQueue.remove(username, options)
      return ctx.json({ success: true })
    } catch (err: any) {
      return ctx.json({ success: false, message: err.message }, 400)
    }
  })

  // 5. 触发下载
  router.post('/api/music/cache/download', async (ctx) => {
    try {
      const {
        songInfo,
        url,
        quality,
        enableOnlyDownloadMode,
        namingPattern,
        cacheLyric,
        embedLyric,
        requestedSource,
        downloadSource,
        sourceName,
      } = await ctx.bodyJson<any>()

      if (!songInfo || !url) return ctx.text('Missing params', 400)

      const reqUsername = ctx.headers.get('x-user-name') || ''
      const isPublic = !reqUsername || reqUsername === 'default'
      let username = '_open'

      if (!isPublic) {
        const verified = verifyUserAuth(ctx)
        if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
        username = verified
      }

      if (namingPattern) {
        if (!verifyAdminAuth(ctx.request)) {
          return ctx.json({ success: false, error: 'Unauthorized to change cache naming pattern' }, 403)
        }
        const normalizedNamingPattern = fileCache.setNamingPattern(namingPattern)
        if (global.lx.config) global.lx.config['cache.namingPattern'] = normalizedNamingPattern
      }

      const songKey = fileCache.normalizeSongId(songInfo) + '_' + (quality || 'unknown')
      console.log(`[Cache] Registering active task: ${songKey} for user: "${username}"`)

      const controller = new AbortController()
      let userTasks = fileCache.activeTasks.get(username)
      if (!userTasks) {
        userTasks = []
        fileCache.activeTasks.set(username, userTasks)
      }
      userTasks.push({ songKey, controller })

      void fileCache.downloadAndCache(
        songInfo,
        url,
        quality,
        username,
        controller.signal,
        !!enableOnlyDownloadMode,
        cacheLyric !== false,
        embedLyric !== false,
        {
          requestedSource: requestedSource || songInfo.source,
          downloadSource,
          sourceName,
        }
      )
        .then(() => console.log(`[Cache] Downloaded ${songInfo.name} for ${username || '_open'}`))
        .catch((err: any) => {
          if (err.message === 'Aborted') {
            console.log(`[Cache] Task aborted for ${songInfo.name}`)
          } else {
            console.error(`[Cache] Failed to download ${songInfo.name}:`, err)
          }
        })
        .finally(() => {
          const tasks = fileCache.activeTasks.get(username)
          if (tasks) {
            const idx = tasks.findIndex((t: any) => t.songKey === songKey)
            if (idx !== -1) {
              tasks.splice(idx, 1)
              console.log(`[Cache] Cleaned up active task: ${songKey} for user: "${username}"`)
            }
          }
        })

      return ctx.json({ success: true, message: 'Download started' })
    } catch {
      return ctx.text('Error', 500)
    }
  })

  // 6. 停止下载任务
  router.post('/api/music/cache/stop', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }

    try {
      const { songKey, queueId, all } = await ctx.bodyJson<{ songKey?: string; queueId?: string; all?: boolean }>()
      if (all) {
        fileCache.stopUserTasks(username)
        serverDownloadQueue.pause(username)
        console.log(`[Cache] Stopped all tasks for user: ${username}`)
      } else if (queueId) {
        serverDownloadQueue.pause(username, queueId)
        console.log(`[Cache] Paused persistent queue task ${queueId} for user: ${username}`)
      } else if (songKey) {
        fileCache.stopUserTasks(username, songKey)
        console.log(`[Cache] Stopped task ${songKey} for user: ${username}`)
      }
      return ctx.json({ success: true })
    } catch (e: any) {
      return ctx.text(e.message, 400)
    }
  })

  // 7. 分发缓存文件（基于 Bun.file 零拷贝高性能分发）
  router.get('/api/music/cache/file/*', async (ctx) => {
    const parts = ctx.pathname.replace('/api/music/cache/file/', '').split('/')
    const reqUsername = parts.length > 1 ? decodeURIComponent(parts[0]) : '_open'
    const filename = parts.length > 1 ? parts[1] : parts[0]

    if (!filename) return ctx.text('Missing filename', 400)

    let username = '_open'
    const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'

    if (!isPublic) {
      const urlToken = ctx.query.get('token')
      const tokenUser = urlToken ? verifyUserAuth({ headers: { 'x-user-token': urlToken } } as any) : verifyUserAuth(ctx)
      if (!tokenUser || tokenUser !== reqUsername) {
        return ctx.text('Unauthorized', 401)
      }
      username = tokenUser
    }

    const decodedFilename = decodeURIComponent(filename)
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const locations = [
      fileCache.getCacheLocation(),
      fileCache.getCacheLocation() === fileCache.CACHE_ROOTS.DATA ? fileCache.CACHE_ROOTS.ROOT : fileCache.CACHE_ROOTS.DATA,
    ]
    const roots: Array<fileCache.CacheFolder> = ['cache', 'music']
    let filePath = ''

    for (const loc of locations) {
      for (const folder of roots) {
        const dir = fileCache.getCacheDir(normalizedUsername, folder === 'music', loc)
        const safeFilename = decodedFilename.replace(/\\/g, '/')
        const checkPath = path.resolve(dir, safeFilename)
        const resolvedDir = path.resolve(dir)
        if (!checkPath.startsWith(resolvedDir + path.sep) && checkPath !== resolvedDir) {
          continue
        }
        if (fs.existsSync(checkPath)) {
          filePath = checkPath
          break
        }
      }
      if (filePath) break
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return ctx.text('File Not Found', 404)
    }

    const bunFile = Bun.file(filePath)
    const size = bunFile.size
    const mtime = bunFile.lastModified
    const etag = `W/"${size}-${mtime}"`
    const lastModified = new Date(mtime).toUTCString()

    const ifNoneMatch = ctx.headers.get('if-none-match')
    const ifModifiedSince = ctx.headers.get('if-modified-since')
    if (ifNoneMatch === etag || (ifModifiedSince && ifModifiedSince === lastModified)) {
      return new Response(null, { status: 304 })
    }

    const rangeHeader = ctx.headers.get('range')
    const contentType = bunFile.type || 'audio/mpeg'

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = match[2] ? parseInt(match[2], 10) : size - 1
        if (start < size) {
          const chunk = bunFile.slice(start, end + 1)
          return new Response(chunk, {
            status: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(end - start + 1),
              'Content-Type': contentType,
              'ETag': etag,
              'Last-Modified': lastModified,
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
      }
    }

    return new Response(bunFile, {
      status: 200,
      headers: {
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'ETag': etag,
        'Last-Modified': lastModified,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  })

  // 8. 缓存统计与清理
  router.get('/api/music/cache/stats', (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }
    try {
      const stats = fileCache.getCacheStats(username)
      return ctx.json({ success: true, data: stats })
    } catch (e: any) {
      return ctx.json({ success: false, message: e.message || 'Failed to get cache stats' }, 500)
    }
  })

  router.post('/api/music/cache/clear', (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }
    try {
      const result = fileCache.clearAllCache(username)
      return ctx.json({ success: true, data: result })
    } catch (e: any) {
      return ctx.json({ success: false, message: e.message || 'Failed to clear cache' }, 500)
    }
  })

  router.post('/api/music/cache/lyric/clear', (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }
    try {
      const result = fileCache.clearLyricCache(username)
      return ctx.json({ success: true, data: result })
    } catch (e: any) {
      return ctx.json({ success: false, message: e.message || 'Failed to clear lyric cache' }, 500)
    }
  })

  router.get('/api/music/cache/progress', (ctx) => {
    const ids = ctx.query.get('ids')?.split(',') || []
    const progress: any = {}
    ids.forEach((id) => {
      if (fileCache.cacheProgress.has(id)) {
        progress[id] = fileCache.cacheProgress.get(id)
      }
    })
    return ctx.json({ success: true, data: progress })
  })

  router.get('/api/music/cache/list', async (ctx) => {
    const targetUserParam = ctx.query.get('user')
    const reqUsername = targetUserParam || ctx.headers.get('x-user-name') || ''
    const isAdmin = verifyAdminAuth(ctx.request)
    const isPublic = !reqUsername || reqUsername === 'default' || reqUsername === '_open' || targetUserParam === '_open'
    let username = '_open'

    if (isPublic) {
      const config = (global.lx?.config ?? {}) as any
      const enablePublicNonAdminLocalMusic = !!config['user.enablePublicNonAdminLocalMusic']
      const verified = verifyUserAuth(ctx)
      if (!enablePublicNonAdminLocalMusic && !isAdmin && !verified) {
        return ctx.json({ success: false, message: '您没有权限查看此目录，请联系管理员设置' }, 403, {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        })
      }
      username = '_open'
    } else {
      const verified = verifyUserAuth(ctx)
      if (!verified) {
        return ctx.json({ success: false, message: 'Unauthorized' }, 401, {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        })
      }
      username = verified
    }

    try {
      const list = await fileCache.getCacheList(username)
      return ctx.json({ success: true, data: list }, 200, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      })
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  router.get('/api/music/cache/cover', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ctx.query.get('user') || ''
    const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const urlToken = ctx.query.get('token')
      const tokenUser = urlToken ? verifyUserAuth({ headers: { 'x-user-token': urlToken } } as any) : verifyUserAuth(ctx)
      if (!tokenUser) return ctx.text('Unauthorized', 401)
      username = tokenUser
    }

    const filename = ctx.query.get('filename')
    if (!filename) return ctx.text('Missing filename', 400)

    const cover = (await fileCache.getCacheCover(filename, username)) as any
    if (cover && cover.data) {
      return new Response(cover.data, {
        status: 200,
        headers: {
          'Content-Type': cover.mime || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }
    return ctx.text('Not Found', 404)
  })

  router.post('/api/music/cache/remove', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isAdmin = verifyAdminAuth(ctx.request)
    const isPublic = !reqUsername || reqUsername === 'default' || reqUsername === '_open'
    let username = '_open'

    if (isPublic) {
      if (!isAdmin) {
        return ctx.json({ success: false, message: '权限不足：删除公共本地歌曲需要验证管理员权限。' }, 403)
      }
    } else {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }

    try {
      const payload = await ctx.bodyJson<any>()
      const legacyFilenames = payload.filenames
      const rawItems = Array.isArray(payload.items)
        ? payload.items
        : (legacyFilenames ? (Array.isArray(legacyFilenames) ? legacyFilenames : [legacyFilenames]) : [])
      if (rawItems.length === 0) throw new Error('Missing items')

      const deleteItems: Array<{ filename: string; folder?: fileCache.CacheFolder }> = rawItems.map((item: any) => {
        if (typeof item === 'string') return { filename: item }
        if (!item || typeof item.filename !== 'string') throw new Error('Invalid delete item')
        if (item.folder !== undefined && item.folder !== 'cache' && item.folder !== 'music') {
          throw new Error('Invalid folder')
        }
        return { filename: item.filename, folder: item.folder }
      })

      let deletedCount = 0
      const failures: Array<{ filename: string; folder?: fileCache.CacheFolder; message: string }> = []
      for (const item of deleteItems) {
        try {
          const result = fileCache.removeCacheFile(item.filename, username, item.folder)
          if (result.deleted) {
            deletedCount++
            accessLog.info(`music file deleted user=${username} folder=${result.folder} filename=${JSON.stringify(item.filename)}`)
          } else {
            failures.push({ ...item, message: 'File not found' })
          }
        } catch (error: any) {
          failures.push({ ...item, message: error?.message || 'Delete failed' })
          accessLog.warn(`music file delete rejected user=${username} folder=${item.folder || 'unspecified'} filename=${JSON.stringify(item.filename)} reason=${JSON.stringify(error?.message || 'Delete failed')}`)
        }
      }

      const success = failures.length === 0
      const statusCode = success ? 200 : (deletedCount > 0 ? 207 : 409)
      return ctx.json({
        success,
        deletedCount,
        failedCount: failures.length,
        failures,
        message: success ? undefined : failures[0]?.message,
      }, statusCode)
    } catch (e: any) {
      return ctx.json({ success: false, message: e.message }, 400)
    }
  })

  router.post('/api/music/cache/move', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }

    try {
      const { filenames } = await ctx.bodyJson<{ filenames?: string[] | string }>()
      if (!filenames) throw new Error('Missing filenames')
      const fileList = Array.isArray(filenames) ? filenames : [filenames]
      const result = await fileCache.switchFolder(fileList, username)
      return ctx.json({ success: true, ...result })
    } catch (e: any) {
      return ctx.text(e.message, 400)
    }
  })

  router.post('/api/music/cache/switch-base', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }

    try {
      const { filenames } = await ctx.bodyJson<{ filenames?: string[] | string }>()
      if (!filenames) throw new Error('Missing filenames')
      const fileList = Array.isArray(filenames) ? filenames : [filenames]
      const result = await fileCache.switchBaseLocation(fileList, username)
      return ctx.json({ success: true, ...result })
    } catch (e: any) {
      return ctx.text(e.message, 400)
    }
  })

  router.post('/api/music/cache/updateMetadata', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }

    try {
      const { filenames } = await ctx.bodyJson<{ filenames?: string[] | string }>()
      if (!filenames) throw new Error('Missing filenames')
      const fileList = Array.isArray(filenames) ? filenames : [filenames]
      const result = await fileCache.batchUpdateMetadata(fileList, username)
      return ctx.json({ success: true, ...result })
    } catch (e: any) {
      return ctx.text(e.message, 400)
    }
  })

  router.post('/api/music/cache/embedLyric', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }

    try {
      const { filenames } = await ctx.bodyJson<{ filenames?: string[] }>()
      if (!filenames || !Array.isArray(filenames)) throw new Error('Missing filenames')

      let successCount = 0
      let skippedCount = 0
      let failCount = 0
      const details: any[] = []

      for (const filename of filenames) {
        let filePath = ''
        let folder: 'cache' | 'music' = 'cache'

        for (const f of ['cache', 'music'] as const) {
          const dir = fileCache.getCacheDir(username, f === 'music')
          const candidate = path.join(dir, filename)
          if (fs.existsSync(candidate)) {
            filePath = candidate
            folder = f
            break
          }
        }

        if (!filePath) {
          details.push({ filename, status: 'fail', reason: '文件不存在' })
          failCount++
          continue
        }

        try {
          const indexItem = fileCache.getIndexItemByFilename(filename, username) as any
          if (indexItem?.metadataWritable === false) {
            details.push({
              filename,
              status: 'fail',
              reason: indexItem.embedLyricError || indexItem.metadataError || '当前音频容器不支持嵌入歌词，外置歌词文件仍可正常使用',
            })
            failCount++
            continue
          }

          let checkTagger: any
          let existingLyrics = ''
          try {
            checkTagger = new MusicTagger()
            checkTagger.loadPath(filePath)
            existingLyrics = checkTagger.lyrics || ''
          } catch (checkError: any) {
            const unsupportedStatus = fileCache.getAudioMetadataUnsupportedStatus(filePath)
            fileCache.setIndexEmbedLyric(filename, username, false, {
              audioContainer: unsupportedStatus.audioContainer,
              metadataWritable: false,
              metadataError: unsupportedStatus.error,
              embedLyricError: unsupportedStatus.error,
            })
            details.push({
              filename,
              status: 'fail',
              reason: unsupportedStatus.error || '当前音频容器不支持嵌入歌词，外置歌词文件仍可正常使用',
            })
            failCount++
            continue
          } finally {
            try { if (checkTagger) checkTagger.dispose() } catch { }
          }

          if (existingLyrics && existingLyrics.trim().length > 10) {
            details.push({ filename, status: 'skipped', reason: '已有歌词标签' })
            skippedCount++
            continue
          }

          const songInfo = indexItem
          const ext = path.extname(filename)
          const baseName = filename.slice(0, filename.length - ext.length)
          const lrcFilename = baseName + '.lrc'
          const dir = fileCache.getCacheDir(username, folder === 'music')
          const lrcPath = path.join(dir, lrcFilename)

          let lyricText: string | null = null

          if (fs.existsSync(lrcPath)) {
            lyricText = fs.readFileSync(lrcPath, 'utf8')
            console.log(`[EmbedLyric] Using local .lrc for: ${filename}`)
          } else if (songInfo && songInfo.source && songInfo.source !== 'unknown') {
            const lyricFetcherFn = fileCache.getLyricFetcher()
            if (lyricFetcherFn) {
              lyricText = await lyricFetcherFn(songInfo)
            }
            if (lyricText) {
              console.log(`[EmbedLyric] Fetched lyric from SDK for: ${filename}`)
            }
          }

          if (!lyricText) {
            details.push({ filename, status: 'fail', reason: '无法获取歌词' })
            failCount++
            continue
          }

          const embedResult = fileCache.embedLyricsIntoFile(filePath, lyricText)
          fileCache.setIndexEmbedLyric(filename, username, embedResult.hasEmbedLyric, {
            audioContainer: embedResult.audioContainer,
            metadataWritable: embedResult.metadataWritable,
            metadataError: embedResult.metadataWritable ? undefined : embedResult.error,
            embedLyricError: embedResult.error,
          })
          if (!embedResult.success) {
            details.push({
              filename,
              status: 'fail',
              reason: embedResult.error || '歌词标签写入后校验失败，外置歌词文件仍可正常使用',
            })
            failCount++
            continue
          }

          details.push({ filename, status: 'success' })
          successCount++
          console.log(`[EmbedLyric] Embedded lyric for: ${filename}`)
        } catch (itemErr: any) {
          details.push({ filename, status: 'fail', reason: itemErr.message || '未知错误' })
          failCount++
        }
      }

      return ctx.json({ success: true, successCount, skippedCount, failCount, details })
    } catch (e: any) {
      return ctx.json({ success: false, message: e.message }, 400)
    }
  })

  router.post('/api/music/cache/link', async (ctx) => {
    const verified = verifyUserAuth(ctx)
    if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    try {
      const { filename, songInfo } = await ctx.bodyJson<{ filename?: string; songInfo?: any }>()
      if (!filename || !songInfo) return ctx.text('Missing params', 400)
      const result = await fileCache.linkLocalFile(filename, songInfo, verified)
      return ctx.json(result)
    } catch (e: any) {
      return ctx.json({ success: false, message: e.message || 'Linking failed' }, 500)
    }
  })

  router.post('/api/music/identify', async (ctx) => {
    const verified = verifyUserAuth(ctx)
    if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    try {
      const { filename, folder } = await ctx.bodyJson<{ filename?: string; folder?: 'cache' | 'music' }>()
      if (!filename) return ctx.text('Missing filename', 400)
      const { identifyLocalSong } = require('./utils/identify')
      const dir = fileCache.getCacheDir(verified, folder === 'music')
      const filePath = path.join(dir, filename)
      if (!fs.existsSync(filePath)) throw new Error('文件不存在: ' + filename)
      const results = await identifyLocalSong(filePath)
      return ctx.json({ success: true, results })
    } catch (e: any) {
      return ctx.json({ success: false, message: e.message || 'Identification failed' }, 500)
    }
  })

  router.get('/api/music/cache/lyric', (ctx) => {
    const source = ctx.query.get('source')
    const songmid = ctx.query.get('songmid') || ctx.query.get('songId') || ctx.query.get('id')
    const songId = ctx.query.get('songId') || ctx.query.get('id')

    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let username = '_open'

    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      username = verified
    }

    if (!source || (!songmid && !songId)) return ctx.text('Missing source or songmid', 400)

    const name = ctx.query.get('name') || ''
    const singer = ctx.query.get('singer') || ''
    const result = fileCache.checkLyricCache({ source, songmid, id: songId, name, singer }, username)
    if (result.exists) {
      return ctx.json({ success: true, data: result.content })
    }
    return ctx.json({ success: false, message: 'Not found in cache' }, 404)
  })

  router.post('/api/music/cache/lyric', async (ctx) => {
    try {
      const { songInfo, lyricsObj, enableOnlyDownloadMode } = await ctx.bodyJson<{
        songInfo?: any
        lyricsObj?: any
        enableOnlyDownloadMode?: boolean
      }>()
      const reqUsername = ctx.headers.get('x-user-name') || ''
      const isPublic = !reqUsername || reqUsername === 'default'
      let username = '_open'

      if (!isPublic) {
        const verified = verifyUserAuth(ctx)
        if (!verified) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
        username = verified
      }

      if (!songInfo || !lyricsObj) return ctx.text('Missing parameters', 400)

      const success = fileCache.saveLyricCache(songInfo, lyricsObj, username, !!enableOnlyDownloadMode)
      return ctx.json({ success })
    } catch {
      return ctx.text('Server internal error', 500)
    }
  })

  // 9. 音乐文件下载中继代理 (GET /api/music/download)
  router.get('/api/music/download', (ctx) => {
    const urlStr = ctx.query.get('url')
    const filename = ctx.query.get('filename') || 'download.mp3'
    const isInline = ctx.query.get('inline') === '1'

    if (!urlStr) return ctx.text('Missing url param', 400)

    return new Promise<Response>((resolve) => {
      try {
        const isTaggingMode = ctx.query.get('tag') === '1'
        const taskId = ctx.query.get('taskId')
        const rangeHeader = ctx.headers.get('range')
        const isFullRange = rangeHeader === 'bytes=0-'

        const doFetch = (targetUrl: string, attempt: number) => {
          if (attempt > 5) {
            resolve(ctx.text('Too Many Redirects', 502))
            return
          }

          try {
            const parsedUrl = new URL(targetUrl)
            const options: any = {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': parsedUrl.origin,
              },
            }

            if (rangeHeader) options.headers['Range'] = rangeHeader

            const lib = parsedUrl.protocol === 'https:' ? https : http

            const proxyReq = lib.request(targetUrl, options, (proxyRes: any) => {
              if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
                const location = proxyRes.headers.location
                if (location) {
                  const nextUrl = location.startsWith('http') ? location : new URL(location, targetUrl).href
                  doFetch(nextUrl, attempt + 1)
                  return
                }
              }

              let contentType = proxyRes.headers['content-type'] || 'application/octet-stream'
              if (contentType.includes('audio/') || contentType.includes('video/')) {
                contentType = contentType.split(';')[0].trim()
              }

              const headers: Record<string, string> = {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
              }

              if (proxyRes.headers['content-length']) headers['Content-Length'] = proxyRes.headers['content-length']
              if (proxyRes.headers['accept-ranges']) headers['Accept-Ranges'] = proxyRes.headers['accept-ranges']
              if (proxyRes.headers['content-range']) headers['Content-Range'] = proxyRes.headers['content-range']

              if (!isInline) {
                headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`
              }

              if (isTaggingMode && (!rangeHeader || isFullRange)) {
                const songName = ctx.query.get('name') || ''
                const artist = ctx.query.get('singer') || ''
                const album = ctx.query.get('album') || ''
                const imageUrl = ctx.query.get('pic') || ''
                const embedLyric = ctx.query.get('lyric') === '1'
                const lyricSource = ctx.query.get('source') || ''
                const lyricSongmid = ctx.query.get('songmid') || ''
                const lyricHash = ctx.query.get('hash') || ''
                const lyricInterval = ctx.query.get('interval') || ''

                const chunks: any[] = []
                let received = 0
                const total = parseInt((proxyRes.headers['content-length'] as string) || '0', 10)
                let lastSpeedAt = Date.now()
                let lastSpeedBytes = 0
                let currentSpeed = 0

                if (taskId) {
                  fileCache.cacheProgress.set(taskId, { progress: 0, status: 'downloading', total, received: 0, speed: 0, updatedAt: Date.now() })
                }

                proxyRes.on('data', (c: any) => {
                  chunks.push(c)
                  if (taskId) {
                    received += c.length
                    const now = Date.now()
                    if (now - lastSpeedAt >= 1000) {
                      currentSpeed = Math.max(0, (received - lastSpeedBytes) / ((now - lastSpeedAt) / 1000))
                      lastSpeedAt = now
                      lastSpeedBytes = received
                    }
                    const progress = total > 0 ? Math.round((received / total) * 100) : 0
                    fileCache.cacheProgress.set(taskId, { progress, status: 'downloading', total, received, speed: currentSpeed, updatedAt: now })
                  }
                })

                proxyRes.on('end', async () => {
                  if (taskId) {
                    fileCache.cacheProgress.set(taskId, { progress: 100, status: 'tagging', total, received, speed: 0, updatedAt: Date.now() })
                  }
                  const finishProgress = () => {
                    if (!taskId) return
                    fileCache.cacheProgress.set(taskId, { progress: 100, status: 'finished', total: total || received, received, speed: 0, updatedAt: Date.now() })
                    setTimeout(() => fileCache.cacheProgress.delete(taskId), 30000)
                  }

                  let tempPath = ''
                  let tagger: any = null
                  try {
                    const buffer = Buffer.concat(chunks)
                    if (buffer.length < 100) throw new Error('File too small, possibly invalid')

                    const ext = path.extname(filename) || '.mp3'
                    tempPath = path.join(os.tmpdir(), `lx_tag_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`)
                    fs.writeFileSync(tempPath, new Uint8Array(buffer))

                    tagger = new MusicTagger()
                    tagger.loadPath(tempPath)
                    if (songName) tagger.title = songName
                    if (artist) tagger.artist = artist
                    if (album) tagger.album = album

                    if (imageUrl) {
                      try {
                        let imgBuf: Buffer | null = null
                        if (imageUrl.startsWith('http')) {
                          const imgResp = await (global as any).fetch(imageUrl)
                          if (imgResp.ok) imgBuf = Buffer.from(await imgResp.arrayBuffer())
                        } else if (imageUrl.startsWith('/api')) {
                          const hostLabel = ctx.headers.get('host') || '127.0.0.1:2026'
                          const internalUrl = `http://${hostLabel}${imageUrl}`
                          const imgResp = await (global as any).fetch(internalUrl)
                          if (imgResp.ok) imgBuf = Buffer.from(await imgResp.arrayBuffer())
                        }
                        if (imgBuf && imgBuf.length > 0) {
                          tagger.pictures = [new MetaPicture('image/jpeg', new Uint8Array(imgBuf), 'Cover')]
                        }
                      } catch (e: any) {
                        console.warn('[DownloadProxy] Picture fetch/embed failed:', imageUrl, e.message)
                      }
                    }

                    if (embedLyric && lyricSource && lyricSongmid && musicSdk[lyricSource]?.getLyric) {
                      try {
                        const lyricReqObj = musicSdk[lyricSource].getLyric({
                          songmid: lyricSongmid,
                          name: songName,
                          singer: artist,
                          hash: lyricHash,
                          interval: lyricInterval,
                        })
                        const lyricResult = await lyricReqObj.promise
                        const lyricText = lyricResult?.lyric || lyricResult?.lrc || ''
                        if (lyricText) tagger.lyrics = lyricText
                      } catch { }
                    }

                    tagger.save()
                    tagger.dispose()
                    tagger = null

                    const tagged = fs.readFileSync(tempPath)
                    headers['Content-Length'] = tagged.length.toString()
                    finishProgress()
                    resolve(new Response(new Uint8Array(tagged), { status: 200, headers }))
                  } catch (e: any) {
                    finishProgress()
                    resolve(new Response(new Uint8Array(Buffer.concat(chunks)), { status: 200, headers }))
                  } finally {
                    if (tagger) tagger.dispose()
                    if (tempPath) fs.unlink(tempPath, () => { })
                  }
                })
                return
              }

              // 零缓冲流式代理返回给客户端
              const stream = new ReadableStream({
                start(controller) {
                  proxyRes.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
                  proxyRes.on('end', () => controller.close())
                  proxyRes.on('error', (err: Error) => controller.error(err))
                },
                cancel() {
                  proxyReq.destroy()
                },
              })

              resolve(new Response(stream, {
                status: proxyRes.statusCode || 200,
                headers,
              }))
            })

            proxyReq.on('error', (err: any) => {
              console.error('[DownloadProxy] Request Error:', err)
              resolve(ctx.text('Request Error', 502))
            })

            proxyReq.end()
          } catch (err: any) {
            console.error('[DownloadProxy] Try Error:', err)
            resolve(ctx.text('Internal Server Error', 500))
          }
        }

        doFetch(urlStr, 0)
      } catch (err: any) {
        console.error('[DownloadProxy] Error:', err)
        resolve(ctx.text('Server Error', 500))
      }
    })
  })

  return router
}
