import path from 'node:path'
import fs from 'node:fs'
// @ts-ignore
import musicSdkRaw from '@/modules/utils/musicSdk/index.js'
const musicSdk = musicSdkRaw as any
import { initUserApis } from '../userApi'
import * as fileCache from '../fileCache'
import * as serverDownloadQueue from '../serverDownloadQueue'
import * as remasterQueue from '../remasterQueue'
import { normalizeSongInfo, resolveServerSong } from './musicResolver'
import { getUserSpace } from '@/user'
import { File } from '@/constants'
import { buildLyrics } from '@/utils/lrcTool'
import { startupLog } from '@/utils/log4js'

/**
 * 初始化服务端所有音乐子系统
 * 包括：SDK/自定义源、文件缓存设置、歌词嵌入钩子、持久化下载队列与重制队列
 */
export const initMusicServices = async (): Promise<void> => {
  // 1. 初始化文件缓存设置
  if (global.lx?.config) {
    if (global.lx.config.serverCacheLocation) {
      fileCache.setCacheLocation(global.lx.config.serverCacheLocation)
    }
    global.lx.config['cache.namingPattern'] = fileCache.setNamingPattern(global.lx.config['cache.namingPattern'])

    // 后台同步活跃用户的缓存索引
    if (global.lx.config.users) {
      for (const user of global.lx.config.users) {
        if (user.name) {
          void fileCache.syncCacheIndex(user.name)
        }
      }
    }
  }

  // 2. 注入歌词获取钩子：用于服务器缓存时自动嵌入 USLT 标签
  fileCache.setLyricFetcher(async (songInfo: any) => {
    try {
      const source = songInfo.source
      if (!source || !musicSdk[source] || !musicSdk[source].getLyric) {
        return null
      }
      let songmid = String(songInfo.songmid || songInfo.id || songInfo.songId || '')
      const sourcePrefix = `${source}_`
      if (songmid.startsWith(sourcePrefix)) songmid = songmid.slice(sourcePrefix.length)
      if (!songmid) return null

      const requestObj = musicSdk[source].getLyric({
        songmid,
        name: songInfo.name || '',
        singer: songInfo.singer || '',
        hash: songInfo.hash || '',
        interval: songInfo.interval || '',
      })
      const result = await requestObj.promise
      if (!result) return null
      return typeof result === 'string' ? result : buildLyrics(result)
    } catch (e: any) {
      startupLog.warn(`[LyricFetcher] Failed for "${songInfo.name}":`, e.message || e)
      return null
    }
  })

  // 3. 初始化 Music SDK
  const proxyEnabled = global.lx?.config?.['proxy.all.enabled']
  const proxyAddress = global.lx?.config?.['proxy.all.address']
  startupLog.info(`Music SDK Proxy: ${proxyEnabled ? `Enabled (${proxyAddress})` : 'Disabled'}`)
  try {
    await musicSdk.init()
    startupLog.info('musicSdk initialized')
  } catch (err) {
    startupLog.error('musicSdk init failed:', err)
  }

  // 4. 初始化自定义用户源
  try {
    startupLog.info('Initializing custom user APIs...')
    await initUserApis()
    startupLog.info('Custom user APIs initialized')
  } catch (err: any) {
    startupLog.error('Failed to initialize user APIs:', err.message)
  }

  // 5. 从 _open 用户 settings.json 读取 serverCacheLocation 预初始化 fileCache
  try {
    const openUserSpace = getUserSpace('_open')
    const settingsPath = path.join(openUserSpace.dataManage.userDir, File.userSettingsJSON)
    if (fs.existsSync(settingsPath)) {
      const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      if (savedSettings.serverCacheLocation) {
        fileCache.setCacheLocation(savedSettings.serverCacheLocation)
      }
      if (savedSettings.serverCacheNamingPattern) {
        fileCache.setNamingPattern(savedSettings.serverCacheNamingPattern)
      }
    }
  } catch (err: any) {
    startupLog.warn('Failed to restore fileCache location:', err.message)
  }

  // 6. 绑定服务端后台下载队列解析器
  serverDownloadQueue.initialize(async (task) => {
    const songInfo = normalizeSongInfo(task.songInfo)
    const apiUsername = task.username === '_open' ? 'open' : task.username
    const resolved = await resolveServerSong(songInfo, task.requestedQuality, apiUsername, true)
    return {
      url: resolved.url,
      quality: resolved.quality,
      songInfo: resolved.songInfo,
      requestedSource: resolved.requestedSource,
      downloadSource: resolved.downloadSource,
      sourceName: resolved.sourceName,
    }
  })

  // 7. 绑定服务端音频洗版重制队列解析器
  remasterQueue.initialize(async (songInfo, requestedQuality, username) => {
    const apiUsername = username === '_open' ? 'open' : username
    const resolved = await resolveServerSong(songInfo, requestedQuality, apiUsername, true)
    return {
      url: resolved.url,
      quality: resolved.quality,
    }
  })
}
