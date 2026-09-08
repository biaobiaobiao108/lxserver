import type { BuiltinOnlineSource } from '@/common/musicSources'

export interface ApiSourceInfo {
  id: string
  name: string
  disabled: boolean
  supportQualitys: Partial<Record<BuiltinOnlineSource, LX.Quality[]>>
}

// Built-in playback URLs are supplied by userApi. Keep this registry typed so
// custom API metadata can be added without reintroducing platform-specific code.
const sources: readonly ApiSourceInfo[] = []

export default sources
