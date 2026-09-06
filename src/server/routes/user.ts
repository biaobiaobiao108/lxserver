import fs from 'node:fs'
import path from 'node:path'
import { Router, type HttpContext } from '../core'
import { verifyAdminAuth } from '../auth'
import { verifyUserAuth } from './auth'
import { getUserSpace, getUserDirname } from '@/user'
import { File } from '@/constants'

/** 辅助获取请求的目标用户空间名称 */
const resolveTargetUsername = (ctx: HttpContext, requireAuth = true): string | null => {
  const config = (global.lx?.config ?? {}) as any
  const targetUserParam = ctx.query.get('user')
  const reqUsername = ctx.headers.get('x-user-name') || targetUserParam || ''
  const isAdmin = verifyAdminAuth(ctx.request)
  const tokenUser = verifyUserAuth(ctx)

  const canAccessOpen = config['user.enablePublicFavorites'] && (
    config['user.enablePublicNonAdminAccess'] || isAdmin || !!tokenUser
  )

  if (targetUserParam === '_open' || reqUsername === '_open' || (!reqUsername && !tokenUser)) {
    if (canAccessOpen) return '_open'
  }

  if (tokenUser) return tokenUser
  if (!requireAuth && reqUsername && reqUsername !== '_open') return reqUsername
  return null
}

/** 注册用户歌单、偏好与曲库数据管理路由 */
export const createUserRouter = (): Router => {
  const router = new Router()

  // 1. 读取用户歌单数据 (GET /api/user/list)
  router.get('/api/user/list', async (ctx) => {
    const username = resolveTargetUsername(ctx, false)
    if (!username) {
      return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    }

    try {
      const userSpace = getUserSpace(username)
      const data = await userSpace.listManage.getListData()
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  // 2. 覆盖保存用户歌单数据 (POST /api/user/list)
  router.post('/api/user/list', async (ctx) => {
    const config = (global.lx?.config ?? {}) as any
    const targetUserParam = ctx.query.get('user')
    const reqUsername = ctx.headers.get('x-user-name') || targetUserParam || ''
    const isAdmin = verifyAdminAuth(ctx.request)
    const tokenUser = verifyUserAuth(ctx)

    let username: string | null = null
    const canAccessOpen = config['user.enablePublicFavorites'] && (
      config['user.enablePublicNonAdminAccess'] || isAdmin || !!tokenUser
    )

    if (targetUserParam === '_open' || reqUsername === '_open' || (!reqUsername && !tokenUser)) {
      if (!canAccessOpen) {
        return ctx.json({ success: false, error: '权限不足：未开启公开访问。' }, 403)
      }
      if (!isAdmin) {
        return ctx.json({ success: false, error: '权限不足：公共歌单修改受限，请先验证管理员身份。' }, 403)
      }
      username = '_open'
    } else {
      username = tokenUser || reqUsername || null
    }

    if (!username) {
      return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    }

    try {
      const listData = await ctx.bodyJson()
      const userSpace = getUserSpace(username)
      await userSpace.listManage.listDataManage.restore(listData)
      await userSpace.listManage.createSnapshot()
      return ctx.json({ success: true })
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  // 3. 用户曲库：歌手与专辑 (GET & POST)
  router.get('/api/user/library/artists', (ctx) => {
    const username = resolveTargetUsername(ctx, false)
    if (!username) return ctx.text('Unauthorized', 401)

    const userDirname = getUserDirname(username)
    const filePath = path.join(global.lx.userPath, userDirname, 'library', 'artists.json')
    if (!fs.existsSync(filePath)) return ctx.json([])
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      return ctx.json(data)
    } catch (e: any) {
      return ctx.text(e.message, 500)
    }
  })

  router.post('/api/user/library/artists', async (ctx) => {
    const username = resolveTargetUsername(ctx, false)
    if (!username) return ctx.text('Unauthorized', 401)
    try {
      const parsed = await ctx.bodyJson()
      if (!Array.isArray(parsed)) throw new Error('Expected an array')
      const userDirname = getUserDirname(username)
      const libDir = path.join(global.lx.userPath, userDirname, 'library')
      if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true })
      fs.writeFileSync(path.join(libDir, 'artists.json'), JSON.stringify(parsed, null, 2), 'utf-8')
      return ctx.json({ success: true })
    } catch (e: any) {
      return ctx.text(e.message, 400)
    }
  })

  router.get('/api/user/library/albums', (ctx) => {
    const username = resolveTargetUsername(ctx, false)
    if (!username) return ctx.text('Unauthorized', 401)

    const userDirname = getUserDirname(username)
    const filePath = path.join(global.lx.userPath, userDirname, 'library', 'albums.json')
    if (!fs.existsSync(filePath)) return ctx.json([])
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      return ctx.json(data)
    } catch (e: any) {
      return ctx.text(e.message, 500)
    }
  })

  router.post('/api/user/library/albums', async (ctx) => {
    const username = resolveTargetUsername(ctx, false)
    if (!username) return ctx.text('Unauthorized', 401)
    try {
      const parsed = await ctx.bodyJson()
      if (!Array.isArray(parsed)) throw new Error('Expected an array')
      const userDirname = getUserDirname(username)
      const libDir = path.join(global.lx.userPath, userDirname, 'library')
      if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true })
      fs.writeFileSync(path.join(libDir, 'albums.json'), JSON.stringify(parsed, null, 2), 'utf-8')
      return ctx.json({ success: true })
    } catch (e: any) {
      return ctx.text(e.message, 400)
    }
  })

  // 4. 用户设置 (GET & POST /api/user/settings)
  router.get('/api/user/settings', (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name')
    const isPublic = !reqUsername || reqUsername === 'default'
    let resolvedUsername: string | null = null

    const config = (global.lx?.config ?? {}) as any
    if (isPublic && config['user.enablePublicRestriction']) {
      resolvedUsername = '_open'
    } else {
      resolvedUsername = verifyUserAuth(ctx)
      if (!resolvedUsername) {
        return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      }
    }

    const userSpace = getUserSpace(resolvedUsername)
    const settingsPath = path.join(userSpace.dataManage.userDir, File.userSettingsJSON)
    if (fs.existsSync(settingsPath)) {
      const settingsData = fs.readFileSync(settingsPath, 'utf8')
      return new Response(settingsData, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return ctx.json({})
  })

  router.post('/api/user/settings', async (ctx) => {
    const reqUsername = ctx.headers.get('x-user-name')
    const isPublic = !reqUsername || reqUsername === 'default'
    let resolvedUsername: string | null = null
    const config = (global.lx?.config ?? {}) as any

    if (isPublic) {
      if (config['user.enablePublicRestriction']) {
        const isAdmin = verifyAdminAuth(ctx.request)
        if (!isAdmin) {
          return ctx.json({ success: false, error: '权限不足：公共用户保存设置受限，请先验证管理员身份。' }, 403)
        }
      }
      resolvedUsername = '_open'
    } else {
      resolvedUsername = verifyUserAuth(ctx)
      if (!resolvedUsername) {
        return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      }
    }

    try {
      const userSpace = getUserSpace(resolvedUsername)
      const settingsPath = path.join(userSpace.dataManage.userDir, File.userSettingsJSON)
      let settings = await ctx.bodyJson()

      if (resolvedUsername === '_open' && config['user.enablePublicRestriction']) {
        const restrictedSettings: any = {}
        const allowedKeys = [
          'enableServerCache', 'enableServerLyricCache', 'serverCacheLocation',
          'serverCacheNamingPattern', 'downloadConcurrency', 'enableRemaster',
          'preferredQuality', 'enableOnlyDownloadMode', 'enablePublicSources',
          'embedLyricToFile', 'preferServerCache',
        ]
        for (const key of allowedKeys) {
          if (settings[key] !== undefined) restrictedSettings[key] = settings[key]
        }
        settings = restrictedSettings
      }

      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
      return ctx.json({ success: true })
    } catch {
      return ctx.text('Invalid JSON data', 400)
    }
  })

  // 5. 歌单与歌曲精准修改 (POST /api/data/*)
  router.post('/api/data/delete-playlist', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    try {
      const { username, playlistId } = await ctx.bodyJson<{ username?: string; playlistId?: string }>()
      if (!username || !playlistId) return ctx.text('Missing parameters', 400)
      const userSpace = getUserSpace(username)
      await userSpace.listManage.listDataManage.userListsRemove([playlistId])
      await userSpace.listManage.createSnapshot()
      return ctx.json({ success: true })
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  router.post('/api/data/delete-song', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    try {
      const { username, playlistId, songId } = await ctx.bodyJson<{ username?: string; playlistId?: string; songId?: string }>()
      if (!username || !playlistId || !songId) return ctx.text('Missing parameters', 400)
      const userSpace = getUserSpace(username)
      await userSpace.listManage.listDataManage.listMusicRemove(playlistId, [songId])
      await userSpace.listManage.createSnapshot()
      return ctx.json({ success: true })
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  router.post('/api/data/rename-playlist', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    try {
      const { username, playlistId, newName } = await ctx.bodyJson<{ username?: string; playlistId?: string; newName?: string }>()
      if (!username || !playlistId || !newName) return ctx.text('Missing parameters', 400)
      const userSpace = getUserSpace(username)
      const listData = await userSpace.listManage.getListData()
      const target = listData.userList.find((l: any) => l.id === playlistId)
      if (!target) return ctx.text('Playlist not found', 404)
      target.name = newName
      await userSpace.listManage.listDataManage.restore(listData)
      await userSpace.listManage.createSnapshot()
      return ctx.json({ success: true })
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  router.post('/api/data/batch-delete-songs', async (ctx) => {
    if (!verifyAdminAuth(ctx.request)) return ctx.text('Unauthorized', 401)
    try {
      const { username, playlistId, songIndices } = await ctx.bodyJson<{ username?: string; playlistId?: string; songIndices?: number[] }>()
      if (!username || !playlistId || !Array.isArray(songIndices)) return ctx.text('Missing parameters', 400)

      const userSpace = getUserSpace(username)
      const listManage = userSpace.listManage
      const listData = await listManage.getListData()
      const playlist = listData.userList.find((list: any) => list.id === playlistId)
      if (!playlist) return ctx.text('Playlist not found', 404)

      const songIds = songIndices.map(index => playlist.list?.[index]?.id).filter(Boolean)
      if (songIds.length === 0) return ctx.text('No valid songs selected', 400)

      await listManage.listDataManage.listMusicRemove(playlistId, songIds)
      await listManage.createSnapshot()
      return ctx.json({ success: true })
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  return router
}
