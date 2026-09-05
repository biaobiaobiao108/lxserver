export interface MusicSourceItem {
  id: string
  name: string
}

export interface MusicSdkPlatform {
  init?: () => Promise<any>
  getMusicUrl?: (songInfo: any, type: string) => Promise<any> | { promise: Promise<any>; cancel: () => void }
  getPic?: (songInfo: any) => Promise<string | null>
  getLyric?: (songInfo: any) => { promise: Promise<{ lyric?: string; lrc?: string; tlyric?: string }>; cancel?: () => void }
  musicSearch?: {
    search: (keyword: string, page: number, limit: number) => Promise<any>
  }
  [key: string]: any
}

export interface MusicSdk {
  sources: MusicSourceItem[]
  kw: MusicSdkPlatform
  kg: MusicSdkPlatform
  tx: MusicSdkPlatform
  wy: MusicSdkPlatform
  mg: MusicSdkPlatform
  bd: MusicSdkPlatform
  xm: MusicSdkPlatform
  init: () => Promise<any[]>
  findMusic: (lists: any[], info: any) => any[]
  supportQuality: Record<string, string[]>
  [key: string]: any
}

declare const musicSdk: MusicSdk
export default musicSdk
export { dateFormat, dateFormat2, decodeName, sizeFormate, formatPlayTime, formatPlayCount } from '../index'
