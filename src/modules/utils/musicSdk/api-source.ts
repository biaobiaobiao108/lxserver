import apiSourceInfo from './api-source-info'
import type { MusicSong } from './types'

interface UserApiInfo {
  enabled?: boolean
  sources?: Record<string, unknown>
}

interface UserApiModule {
  getLoadedApis?: () => Array<UserApiInfo & Record<string, unknown>>
  callUserApiGetMusicUrl?: (source: string, songInfo: MusicSong, type: string) => Promise<unknown>
}

interface CustomMusicApi {
  getMusicUrl: (songInfo: MusicSong, type: string) => Promise<unknown>
}

export const supportQuality: Record<string, unknown> = {}
for (const api of apiSourceInfo) supportQuality[api.id] = api.supportQualitys

let userApiModule: UserApiModule | null = null

const getUserApi = (): UserApiModule => {
  if (userApiModule) return userApiModule
  try {
    userApiModule = require('../../../server/userApi') as UserApiModule
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[api-source] Failed to load userApi:', message)
    userApiModule = { getLoadedApis: () => [] }
  }
  return userApiModule
}

const getUserApis = (): Record<string, CustomMusicApi> => {
  const userApi = getUserApi()
  const loadedApis = userApi.getLoadedApis?.() ?? []
  const apis: Record<string, CustomMusicApi> = {}

  for (const apiInfo of loadedApis) {
    if (!apiInfo.enabled || !apiInfo.sources || !userApi.callUserApiGetMusicUrl) continue
    for (const source of Object.keys(apiInfo.sources)) {
      apis[source] = {
        getMusicUrl: (songInfo, type) => userApi.callUserApiGetMusicUrl!(source, songInfo, type),
      }
    }
  }
  return apis
}

export const apis = (source: string): CustomMusicApi => {
  const userApis = getUserApis()
  if (userApis[source]) return userApis[source]
  throw new Error(`未找到支持 ${source} 平台的自定义源，请在设置中添加或启用相关源`)
}
