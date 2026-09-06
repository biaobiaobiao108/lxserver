import { Router, type HttpContext } from '../core'
import { verifyUserAuth } from './auth'
import { normalizeSongInfo, resolveServerSong } from '../services/musicResolver'
import { isSourceSupported, callUserApiGetMusicUrl } from '../userApi'
// @ts-ignore
import musicSdkRaw from '@/modules/utils/musicSdk/index.js'
const musicSdk = musicSdkRaw as any
import * as fileCache from '../fileCache'
import needle from 'needle'
import fs from 'node:fs'
import path from 'node:path'

/** 音乐解析进度 SSE 专属通道: requestId -> Controller */
export const musicProgressControllers = new Map<string, ReadableStreamDefaultController<Uint8Array>>()

/** 格式化字节大小 */
const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${units[index]}`
}

const getHeaderValue = (headers: Record<string, any>, key: string): string | undefined => {
  const value = headers[key] ?? headers[key.toLowerCase()]
  if (Array.isArray(value)) return value[0]
  return value == null ? undefined : String(value)
}

const parseContentLength = (headers: Record<string, any>): number | null => {
  const range = getHeaderValue(headers, 'content-range')
  const total = range?.match(/\/(\d+)$/)?.[1]
  if (total) {
    const parsed = Number(total)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  const length = Number(getHeaderValue(headers, 'content-length'))
  if (Number.isFinite(length) && length > 0) return length

  return null
}

const getAudioRemoteSize = async (audioUrl: string): Promise<number | null> => {
  if (!/^https?:\/\//i.test(audioUrl)) return null

  const urlObj = new URL(audioUrl)
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': urlObj.origin,
  }
  const options = {
    follow_max: 5,
    response_timeout: 8000,
    read_timeout: 8000,
    headers,
  }

  try {
    const resp = await needle('head', audioUrl, null, options)
    const size = parseContentLength(resp.headers || {})
    if (size) return size
  } catch (e: any) {
    console.warn(`[QualitySize] HEAD failed: ${e.message}`)
  }

  try {
    const resp = await needle('get', audioUrl, null, {
      ...options,
      headers: {
        ...headers,
        Range: 'bytes=0-0',
      },
    })
    return parseContentLength(resp.headers || {})
  } catch (e: any) {
    console.warn(`[QualitySize] Range probe failed: ${e.message}`)
  }

  return null
}

/** 注册在线音乐检索、解析与播放元数据路由 */
export const createMusicRouter = (): Router => {
  const router = new Router()

  // 1. 音乐搜索 API
  router.get('/api/music/search', async (ctx) => {
    const name = ctx.query.get('name') || ''
    const source = ctx.query.get('source') || 'kw'
    const type = ctx.query.get('type') || 'song'
    const limit = parseInt(ctx.query.get('limit') || '20')
    const page = parseInt(ctx.query.get('page') || '1')
    const fetchPages = parseInt(ctx.query.get('pages') || '1')

    if (!name) return ctx.text('Missing name', 400)

    try {
      if (!musicSdk[source]) {
        throw new Error(`Source ${source} is not supported`)
      }

      let result: any
      if (type === 'song') {
        const PAGE_SIZE = 20
        let allSongs: any[] = []
        const startPage = page
        const endPage = page + fetchPages - 1

        for (let p = startPage; p <= endPage; p++) {
          const searchData = await musicSdk[source].musicSearch.search(name, p, PAGE_SIZE)
          const pageList: any[] = searchData.list || []
          allSongs = allSongs.concat(pageList)
          if (pageList.length < PAGE_SIZE) break
        }
        result = allSongs
      } else if (type === 'singer') {
        if (!musicSdk[source].extendSearch || !musicSdk[source].extendSearch.searchSinger) {
          throw new Error(`Source ${source} does not support singer search`)
        }
        const searchData = await musicSdk[source].extendSearch.searchSinger(name, page, limit)
        result = searchData.list || []
      } else if (type === 'album') {
        if (!musicSdk[source].extendSearch || !musicSdk[source].extendSearch.searchAlbum) {
          throw new Error(`Source ${source} does not support album search`)
        }
        const searchData = await musicSdk[source].extendSearch.searchAlbum(name, page, limit)
        result = searchData.list || []
      } else if (type === 'playlist') {
        if (!musicSdk[source].extendSearch || !musicSdk[source].extendSearch.searchPlaylist) {
          throw new Error(`Source ${source} does not support playlist search`)
        }
        const searchData = await musicSdk[source].extendSearch.searchPlaylist(name, page, limit)
        result = searchData.list || []
      } else {
        throw new Error(`Invalid search type: ${type}`)
      }

      return ctx.json(result)
    } catch (err: any) {
      console.error(err)
      return ctx.json({ error: err.message, code: 500 }, 500)
    }
  })

  // 2. 搜索提示 (TipSearch) API
  router.get('/api/music/tipSearch', async (ctx) => {
    const name = ctx.query.get('name') || ''
    const source = ctx.query.get('source') || 'kw'
    if (!name) return ctx.json([])
    try {
      if (!musicSdk[source] || !musicSdk[source].tipSearch) {
        return ctx.json([])
      }
      const tips = await musicSdk[source].tipSearch.search(name)
      return ctx.json(tips || [])
    } catch {
      return ctx.json([])
    }
  })

  // 3. 歌手详情 API
  router.get('/api/music/artistDetail', async (ctx) => {
    const id = ctx.query.get('id')
    const source = ctx.query.get('source') || 'wy'
    if (!id) return ctx.text('Missing id', 400)
    try {
      const data = await musicSdk[source].extendDetail.getArtistDetail(id)
      return ctx.json(data)
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  // 4. 歌手专辑列表 API
  router.get('/api/music/artistAlbums', async (ctx) => {
    const id = ctx.query.get('id')
    const source = ctx.query.get('source') || 'wy'
    const page = parseInt(ctx.query.get('page') || '1')
    if (!id) return ctx.text('Missing id', 400)
    try {
      const data = await musicSdk[source].extendDetail.getArtistAlbums(id, page)
      return ctx.json(data)
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  // 5. 歌手歌曲列表 API
  router.get('/api/music/artistSongs', async (ctx) => {
    const id = ctx.query.get('id')
    const source = ctx.query.get('source') || 'wy'
    const order = ctx.query.get('order') || 'hot'
    if (!id) return ctx.text('Missing id', 400)
    try {
      const PAGE_SIZE = 100
      const configuredMaxPages = Number((global.lx.config as any)?.['artist.maxFetchPages'])
      const MAX_PAGES = Number.isFinite(configuredMaxPages) && configuredMaxPages > 0
        ? Math.min(Math.floor(configuredMaxPages), 100)
        : 20
      let allSongs: any[] = []
      for (let p = 1; p <= MAX_PAGES; p++) {
        const data = await musicSdk[source].extendDetail.getArtistSongs(id, p, PAGE_SIZE, order)
        const pageList: any[] = data.list || []
        allSongs = allSongs.concat(pageList)
        const total = Number(data.total) || 0
        if (pageList.length < PAGE_SIZE || (total > 0 && allSongs.length >= total)) break
      }
      return ctx.json(allSongs)
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  // 6. 专辑歌曲 API
  router.get('/api/music/albumSongs', async (ctx) => {
    const id = ctx.query.get('id')
    const source = ctx.query.get('source') || 'wy'
    if (!id) return ctx.text('Missing id', 400)
    try {
      const data = await musicSdk[source].extendDetail.getAlbumSongs(id)
      return ctx.json(data)
    } catch (err: any) {
      return ctx.text(err.message, 500)
    }
  })

  // 7. 音乐解析进度 SSE 端点 (无需登录, 用 reqId 区分)
  router.get('/api/music/progress', (ctx) => {
    const reqId = ctx.query.get('reqId')
    if (!reqId) return ctx.text('Missing reqId', 400)

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('retry: 3000\n\n'))
        musicProgressControllers.set(reqId, controller)
      },
      cancel() {
        musicProgressControllers.delete(reqId)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
      },
    })
  })

  // 8. 音乐播放 URL 解析 API
  router.post('/api/music/url', async (ctx) => {
    const clientUsername = ctx.headers.get('x-user-name') || undefined
    let verifiedUsername = 'open'

    if (clientUsername && clientUsername !== 'default' && clientUsername !== 'open' && clientUsername !== '_open') {
      const verified = verifyUserAuth(ctx)
      if (!verified || verified !== clientUsername) {
        return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      }
      verifiedUsername = verified
    }

    const reqId = ctx.headers.get('x-req-id') || undefined

    const pushProgress = async (attempt: any, retries = 10): Promise<void> => {
      if (!reqId) return
      const controller = musicProgressControllers.get(reqId)
      if (controller) {
        try {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(attempt)}\n\n`))
        } catch { }
        return
      }
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 300))
        await pushProgress(attempt, retries - 1)
      } else {
        console.warn(`[SSE] ReqId ${reqId} not found after retries (${musicProgressControllers.size} clients registered)`)
      }
    }

    try {
      let { songInfo, quality, enableAutoSwitchApiSource } = await ctx.bodyJson<{
        songInfo?: any
        quality?: string
        enableAutoSwitchApiSource?: boolean
      }>()

      songInfo = normalizeSongInfo(songInfo)
      if (!songInfo || !songInfo.source) {
        throw new Error('Invalid songInfo')
      }

      const source = songInfo.source
      let result: any
      let customSourceError: string | null = null
      let attempts: any[] = []

      if (isSourceSupported(source, verifiedUsername)) {
        try {
          console.log(`[MusicUrl] Using custom source for: ${source} (ReqId: ${reqId || 'None'}, User: ${verifiedUsername})`)
          const userApiResult = await callUserApiGetMusicUrl(
            source,
            songInfo,
            quality || '128k',
            verifiedUsername,
            (attempt) => { void pushProgress(attempt) },
            enableAutoSwitchApiSource !== false
          )
          result = userApiResult
          attempts = userApiResult.attempts || []
        } catch (userApiError: any) {
          console.error(`[MusicUrl] Custom source failed:`, userApiError.message)
          customSourceError = userApiError.message
          attempts = userApiError.attempts || []
        }
      } else {
        void pushProgress({ name: '系统', status: 'fail', message: `未找到支持 ${source} 平台的自定义源，请在设置中添加或启用相关源` })
      }

      if (!result) {
        const errMsg = customSourceError || `未找到支持 ${source} 平台的自定义源，请在设置中添加或启用相关源`
        const err: any = new Error(errMsg)
        err.attempts = attempts
        throw err
      }

      if (attempts.length > 0) result.attempts = attempts

      if (result && result.url) {
        if (result.url.startsWith('http')) {
          const checkRedirect = async (u: string, depth = 0): Promise<string> => {
            if (depth > 3) return u
            try {
              const resp = await needle('head', u, null, {
                follow_max: 0,
                response_timeout: 4000,
                read_timeout: 4000,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Referer': new URL(u).origin,
                },
              })
              if (resp.statusCode && [301, 302, 303, 307, 308].includes(resp.statusCode) && resp.headers.location) {
                let nextUrl = resp.headers.location
                if (!nextUrl.startsWith('http')) {
                  try { nextUrl = new URL(nextUrl, u).href } catch { }
                }
                return checkRedirect(nextUrl, depth + 1)
              }
              if (resp.statusCode !== undefined && resp.statusCode >= 400) {
                console.warn(`[MusicUrl] Redirect check failed with status ${resp.statusCode}, using original URL`)
                return u
              }
            } catch (e: any) {
              console.warn(`[MusicUrl] head check failed: ${e.message}`)
            }
            return u
          }

          const finalUrl = await checkRedirect(result.url)
          if (finalUrl !== result.url) {
            result.url = finalUrl
          }
        }

        result.requestedSource = songInfo.source
        result.downloadSource = fileCache.detectDownloadSource(result.url, songInfo.source)
      }

      return ctx.json(result)
    } catch (err: any) {
      console.error('[MusicUrl] Error:', err.message)
      return ctx.json({ error: err.message, code: 500, attempts: err.attempts }, 500)
    }
  })

  // 9. 音质真实文件大小 API
  router.post('/api/music/quality/size', async (ctx) => {
    const clientUsername = ctx.headers.get('x-user-name') || undefined
    let verifiedUsername = 'open'

    if (clientUsername && clientUsername !== 'default' && clientUsername !== 'open' && clientUsername !== '_open') {
      const verified = verifyUserAuth(ctx)
      if (!verified || verified !== clientUsername) {
        return ctx.json({ success: false, message: 'Unauthorized' }, 401)
      }
      verifiedUsername = verified
    }

    try {
      let { songInfo, quality } = await ctx.bodyJson<{ songInfo?: any; quality?: string }>()
      songInfo = normalizeSongInfo(songInfo)
      if (!songInfo || !songInfo.source || !quality) {
        throw new Error('Invalid quality size request')
      }

      const result = await resolveServerSong(songInfo, quality, verifiedUsername, false)
      const bytes = await getAudioRemoteSize(result.url)
      if (!bytes) throw new Error('无法读取真实文件大小')

      return ctx.json({
        success: true,
        quality,
        bytes,
        size: formatBytes(bytes),
        type: result.quality,
        source: fileCache.detectDownloadSource(result.url, result.downloadSource || result.songInfo?.source),
        sourceName: result.sourceName,
      })
    } catch (err: any) {
      console.error('[QualitySize] Error:', err.message)
      return ctx.json({ success: false, error: err.message, code: 500 }, 500)
    }
  })

  // 10. 在线歌词查询 API (POST & GET)
  router.post('/api/music/lyric', async (ctx) => {
    try {
      let { songInfo } = await ctx.bodyJson<{ songInfo?: any }>()
      songInfo = normalizeSongInfo(songInfo)
      if (!songInfo || !songInfo.source) {
        throw new Error('Invalid songInfo')
      }
      const source = songInfo.source
      if (!musicSdk[source] || !musicSdk[source].getLyric) {
        throw new Error(`Source ${source} not supported`)
      }
      const result = await musicSdk[source].getLyric(songInfo)
      return ctx.json(result)
    } catch (err: any) {
      console.error(err)
      return ctx.text(err.message, 500)
    }
  })

  router.get('/api/music/lyric', async (ctx) => {
    const source = ctx.query.get('source')
    let songmid = ctx.query.get('songmid') || ctx.query.get('songId') || ctx.query.get('id')

    if (!source || !songmid) {
      return ctx.text('Missing source or songmid', 400)
    }

    const sourcePrefix = `${source}_`
    if (songmid.startsWith(sourcePrefix)) {
      songmid = songmid.slice(sourcePrefix.length)
    }

    const reqUsername = ctx.headers.get('x-user-name') || ''
    const isPublic = !reqUsername || reqUsername === 'default'
    let lyricUsername = '_open'
    if (!isPublic) {
      const verified = verifyUserAuth(ctx)
      if (verified) lyricUsername = verified
    }

    const localLyricResult = fileCache.checkLyricCache({
      source,
      songmid,
      id: ctx.query.get('songId') || ctx.query.get('id') || songmid,
      name: ctx.query.get('name') || '',
      singer: ctx.query.get('singer') || '',
    }, lyricUsername)

    if (localLyricResult.exists && localLyricResult.content) {
      return ctx.json({ ...localLyricResult.content, _fromLocalCache: true }, 200, {
        'Cache-Control': 'public, max-age=86400',
      })
    }

    try {
      if (!musicSdk[source]) throw new Error('Source not supported')

      const songInfo = {
        songmid,
        name: ctx.query.get('name') || '',
        singer: ctx.query.get('singer') || '',
        hash: ctx.query.get('hash') || '',
        interval: ctx.query.get('interval') || '',
        copyrightId: ctx.query.get('copyrightId') || '',
        albumId: ctx.query.get('albumId') || '',
        lrcUrl: ctx.query.get('lrcUrl') || '',
        mrcUrl: ctx.query.get('mrcUrl') || '',
        trcUrl: ctx.query.get('trcUrl') || '',
      }

      const requestObj = musicSdk[source].getLyric(songInfo)
      const lyricInfo = await requestObj.promise

      return ctx.json(lyricInfo, 200, {
        'Cache-Control': 'public, max-age=86400',
      })
    } catch (err: any) {
      console.error('[Lyric] Fetch error:', source, songmid, err.message || err)
      const fallbackResult = fileCache.checkLyricCache({
        source,
        songmid,
        id: ctx.query.get('songId') || ctx.query.get('id') || songmid,
        name: ctx.query.get('name') || '',
        singer: ctx.query.get('singer') || '',
      }, lyricUsername)

      if (fallbackResult.exists && fallbackResult.content) {
        return ctx.json({ ...fallbackResult.content, _fromLocalCache: true })
      }

      return ctx.text(err.message || 'Failed to fetch lyric', 500)
    }
  })

  // 11. 热搜 API
  router.get('/api/music/hotSearch', async (ctx) => {
    const source = ctx.query.get('source') || 'mg'
    try {
      if (!musicSdk[source] || !musicSdk[source].hotSearch) {
        return ctx.json({ error: '该音源不支持热搜功能' }, 404)
      }
      const result = await musicSdk[source].hotSearch.getList()
      return ctx.json(result, 200, { 'Cache-Control': 'public, max-age=300' })
    } catch (err: any) {
      console.error('[HotSearch] Error:', err.message)
      return ctx.json([])
    }
  })

  // 12. 歌单分类标签 API
  router.get('/api/music/songList/tags', async (ctx) => {
    const source = ctx.query.get('source') || 'wy'
    try {
      if (!musicSdk[source] || !musicSdk[source].songList) {
        throw new Error(`Source ${source} does not support songList`)
      }
      const result = await musicSdk[source].songList.getTags()
      const sortList = musicSdk[source].songList.sortList
      return ctx.json({ ...result, sortList })
    } catch (err: any) {
      return ctx.json({ error: err.message || '获取歌单标签失败' }, 500)
    }
  })

  // 13. 歌单列表 API
  router.get('/api/music/songList/list', async (ctx) => {
    const source = ctx.query.get('source') || 'wy'
    const tagId = ctx.query.get('tagId') || ''
    const sortId = ctx.query.get('sortId') || 'hot'
    const page = parseInt(ctx.query.get('page') || '1')
    try {
      if (!musicSdk[source] || !musicSdk[source].songList) {
        throw new Error(`Source ${source} does not support songList`)
      }
      const result = await musicSdk[source].songList.getList(sortId, tagId, page)
      return ctx.json(result)
    } catch (err: any) {
      return ctx.json({ error: err.message || '获取歌单列表失败' }, 500)
    }
  })

  // 14. 歌单详情 API
  router.get('/api/music/songList/detail', async (ctx) => {
    const source = ctx.query.get('source') || 'wy'
    const id = ctx.query.get('id')
    const page = parseInt(ctx.query.get('page') || '1')
    if (!id) return ctx.text('Missing id', 400)
    try {
      if (!musicSdk[source] || !musicSdk[source].songList) {
        throw new Error(`Source ${source} does not support songList`)
      }
      const result = await musicSdk[source].songList.getListDetail(id, page)
      if (result && result.list) {
        result.list = result.list.map(normalizeSongInfo)
      }
      return ctx.json(result)
    } catch (err: any) {
      return ctx.json({ error: err.message || '获取歌单详情失败' }, 500)
    }
  })

  // 15. 歌单搜索 API
  router.get('/api/music/songList/search', async (ctx) => {
    const source = ctx.query.get('source') || 'wy'
    const text = ctx.query.get('text')
    const page = parseInt(ctx.query.get('page') || '1')
    if (!text) return ctx.text('Missing text', 400)
    try {
      if (!musicSdk[source] || !musicSdk[source].songList) {
        throw new Error(`Source ${source} does not support songList`)
      }
      const result = await musicSdk[source].songList.search(text, page)
      return ctx.json(result)
    } catch (err: any) {
      return ctx.json({ error: err.message || '搜索歌单失败' }, 500)
    }
  })

  // 16. 用户歌单 API
  router.get('/api/music/songList/userPlaylist', async (ctx) => {
    const source = ctx.query.get('source') || 'tx'
    const uid = ctx.query.get('uid')
    const page = parseInt(ctx.query.get('page') || '1')
    if (!uid) return ctx.text('Missing uid', 400)
    try {
      if (!musicSdk[source] || !musicSdk[source].userPlaylist) {
        throw new Error(`Source ${source} does not support userPlaylist`)
      }
      const result = await musicSdk[source].userPlaylist.getList(uid, page)
      return ctx.json(result)
    } catch (err: any) {
      return ctx.json({ error: err.message || '获取用户歌单失败' }, 500)
    }
  })

  // 17. 排行榜列表 API
  router.get('/api/music/leaderboard/boards', async (ctx) => {
    const source = ctx.query.get('source') || 'kg'
    try {
      if (!musicSdk[source] || !musicSdk[source].leaderboard) {
        throw new Error(`Source ${source} does not support leaderboard`)
      }
      const result = await musicSdk[source].leaderboard.getBoards()
      return ctx.json(result, 200, { 'Cache-Control': 'public, max-age=600' })
    } catch (err: any) {
      return ctx.json({ error: err.message || '获取排行榜列表失败' }, 500)
    }
  })

  // 18. 排行榜内歌曲列表 API
  router.get('/api/music/leaderboard/list', async (ctx) => {
    const source = ctx.query.get('source') || 'kg'
    const bangid = ctx.query.get('bangid')
    const page = parseInt(ctx.query.get('page') || '1')
    if (!bangid) return ctx.text('Missing bangid', 400)
    try {
      if (!musicSdk[source] || !musicSdk[source].leaderboard) {
        throw new Error(`Source ${source} does not support leaderboard`)
      }
      const result = await musicSdk[source].leaderboard.getList(bangid, page)
      if (result && result.list) {
        result.list = result.list.map(normalizeSongInfo)
      }
      return ctx.json(result)
    } catch (err: any) {
      return ctx.json({ error: err.message || '获取排行榜歌曲失败' }, 500)
    }
  })

  // 19. 歌曲评论 API
  router.post('/api/music/comment', async (ctx) => {
    try {
      let { songInfo, type, page, limit } = await ctx.bodyJson<{
        songInfo?: any
        type?: string
        page?: number
        limit?: number
      }>()
      songInfo = normalizeSongInfo(songInfo)
      if (!songInfo || !songInfo.source) throw new Error('Invalid songInfo')
      const source = songInfo.source

      if (!musicSdk[source] || !musicSdk[source].comment) {
        throw new Error(`Source ${source} not supported for comments`)
      }

      const method = type === 'hot' ? 'getHotComment' : 'getComment'
      if (!musicSdk[source].comment[method]) {
        throw new Error(`Method ${method} not supported for source ${source}`)
      }

      const result = await musicSdk[source].comment[method](songInfo, page, limit)
      return ctx.json(result)
    } catch (err: any) {
      return ctx.json({ error: err.message, code: 500 }, 500)
    }
  })

  return router
}
