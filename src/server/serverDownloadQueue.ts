import fs from 'node:fs'
import path from 'node:path'
import * as fileCache from './fileCache'

export type ServerDownloadStatus = 'waiting' | 'downloading' | 'tagging' | 'paused' | 'finished' | 'exists' | 'error'

export interface ServerDownloadTask {
  id: string
  username: string
  songKey: string
  activeSongKey?: string
  songInfo: any
  quality: string
  requestedQuality: string
  status: ServerDownloadStatus
  progress: number
  total: number
  received: number
  speed: number
  errorMsg: string
  enableOnlyDownloadMode: boolean
  cacheLyric: boolean
  embedLyric: boolean
  createdAt: number
  updatedAt: number
}

interface QueueInput {
  id?: string
  songInfo: any
  quality?: string
  enableOnlyDownloadMode?: boolean
  cacheLyric?: boolean
  embedLyric?: boolean
}

interface ResolveResult {
  url: string
  quality?: string
  songInfo?: any
  requestedSource?: string
  downloadSource?: string
  sourceName?: string
}

type DownloadResolver = (task: ServerDownloadTask) => Promise<ResolveResult>

const DEFAULT_CONCURRENT = 3
const MAX_CONCURRENT_PER_USER = 5
export const MAX_PENDING_TASKS_PER_USER = 500
export const MAX_HISTORY_PER_USER = 200
const tasks = new Map<string, ServerDownloadTask>()
const controllers = new Map<string, AbortController>()
const concurrencyByUser = new Map<string, number>()
let resolver: DownloadResolver | null = null
let initialized = false
let processing = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

const taskMapKey = (username: string, id: string) => `${username}:${id}`
const getQueueFile = () => path.join(global.lx.dataPath, 'server-download-queue.json')
const validStatuses = new Set<ServerDownloadStatus>(['waiting', 'downloading', 'tagging', 'paused', 'finished', 'exists', 'error'])
const resumableStatuses = new Set<ServerDownloadStatus>(['waiting', 'downloading', 'tagging', 'paused'])
const terminalStatuses = new Set<ServerDownloadStatus>(['finished', 'exists'])

const getTaskIdentity = (task: Pick<ServerDownloadTask, 'username' | 'songInfo' | 'quality' | 'requestedQuality' | 'songKey' | 'activeSongKey'>) => {
  const songInfo = task.songInfo || {}
  const normalizedSongId = fileCache.normalizeSongId(songInfo)
  const requestedQuality = String(task.requestedQuality || task.quality || 'unknown')
  if (normalizedSongId) return `${task.username}:${normalizedSongId}:${requestedQuality}`

  const source = String(songInfo.source || songInfo.meta?.source || 'unknown')
  const name = String(songInfo.name || songInfo.meta?.songName || '')
  const singer = String(songInfo.singer || songInfo.meta?.singerName || '')
  const album = String(songInfo.albumName || songInfo.meta?.albumName || '')
  const fallbackKey = String(task.songKey || task.activeSongKey || `${source}:${name}:${singer}:${album}`)
  return `${task.username}:${fallbackKey}:${requestedQuality}`
}

const taskStatusPriority = (status: ServerDownloadStatus) => {
  if (terminalStatuses.has(status)) return 3
  if (status === 'downloading' || status === 'tagging') return 2
  if (status === 'waiting') return 1
  return 0
}

const shouldReplaceTask = (current: ServerDownloadTask, candidate: ServerDownloadTask) => {
  // /music is the stricter target: a file there also satisfies cache lookups,
  // while a file in /cache does not satisfy an only-download request.
  const currentTargetsMusic = current.enableOnlyDownloadMode === true
  const candidateTargetsMusic = candidate.enableOnlyDownloadMode === true
  if (candidateTargetsMusic !== currentTargetsMusic) return candidateTargetsMusic

  const currentPriority = taskStatusPriority(current.status)
  const candidatePriority = taskStatusPriority(candidate.status)
  if (candidatePriority !== currentPriority) return candidatePriority > currentPriority
  return (candidate.updatedAt || candidate.createdAt) > (current.updatedAt || current.createdAt)
}

/** Keep one persisted task for each user/song/requested-quality combination. */
export const deduplicateDownloadTasks = (taskList: ServerDownloadTask[]) => {
  const retained = new Map<string, ServerDownloadTask>()
  for (const task of taskList) {
    const identity = getTaskIdentity(task)
    const current = retained.get(identity)
    if (!current || shouldReplaceTask(current, task)) retained.set(identity, task)
  }
  return Array.from(retained.values())
}

const deduplicateTasksInMemory = () => {
  const currentTasks = Array.from(tasks.values())
  const retainedTasks = deduplicateDownloadTasks(currentTasks)
  if (retainedTasks.length === currentTasks.length) return false

  const retainedKeys = new Set(retainedTasks.map(task => taskMapKey(task.username, task.id)))
  for (const task of currentTasks) {
    const key = taskMapKey(task.username, task.id)
    if (!retainedKeys.has(key)) controllers.get(key)?.abort()
  }

  tasks.clear()
  retainedTasks.forEach(task => tasks.set(taskMapKey(task.username, task.id), task))
  return true
}

const normalizeConcurrency = (value: unknown) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_CONCURRENT
  return Math.min(MAX_CONCURRENT_PER_USER, Math.max(1, parsed))
}

export const getConcurrency = (username: string) => concurrencyByUser.get(username) || DEFAULT_CONCURRENT

const sanitizeId = (value: unknown) => {
  const id = String(value || '')
  return /^[A-Za-z0-9_-]{1,160}$/.test(id) ? id : `server_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export const pruneDownloadHistory = (
  taskList: ServerDownloadTask[],
  maxHistoryPerUser = MAX_HISTORY_PER_USER,
) => {
  const historicalByUser = new Map<string, ServerDownloadTask[]>()
  for (const task of taskList) {
    if (resumableStatuses.has(task.status)) continue
    const history = historicalByUser.get(task.username) || []
    history.push(task)
    historicalByUser.set(task.username, history)
  }

  const removedKeys = new Set<string>()
  for (const history of historicalByUser.values()) {
    history
      .sort((a, b) => (b.updatedAt - a.updatedAt) || (b.createdAt - a.createdAt))
      .slice(maxHistoryPerUser)
      .forEach(task => removedKeys.add(taskMapKey(task.username, task.id)))
  }
  return taskList.filter(task => !removedKeys.has(taskMapKey(task.username, task.id)))
}

const pruneHistory = () => {
  const retained = pruneDownloadHistory(Array.from(tasks.values()))
  const removed = tasks.size - retained.length
  if (removed > 0) {
    tasks.clear()
    retained.forEach(task => tasks.set(taskMapKey(task.username, task.id), task))
  }
  return removed
}

const saveNow = () => {
  if (!initialized) return
  deduplicateTasksInMemory()
  const removed = pruneHistory()
  if (removed > 0) {
    console.log(`[ServerDownloadQueue] Pruned ${removed} old history task(s)`)
  }
  const file = getQueueFile()
  const tempFile = `${file}.tmp`
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(tempFile, JSON.stringify({
      version: 2,
      concurrencyByUser: Object.fromEntries(concurrencyByUser),
      tasks: Array.from(tasks.values()),
    }, null, 2), 'utf8')
    fs.renameSync(tempFile, file)
  } catch (err) {
    console.warn('[ServerDownloadQueue] Failed to save queue:', err)
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile) } catch (e) { }
  }
}

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveNow()
  }, 150)
}

const loadTasks = () => {
  const file = getQueueFile()
  if (!fs.existsSync(file)) return
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const savedTasks = Array.isArray(data) ? data : data?.tasks
    if (!Array.isArray(savedTasks)) return
    if (!Array.isArray(data) && data?.concurrencyByUser && typeof data.concurrencyByUser === 'object') {
      for (const [username, value] of Object.entries(data.concurrencyByUser)) {
        concurrencyByUser.set(username, normalizeConcurrency(value))
      }
    }
    const restoredTasks: ServerDownloadTask[] = []
    for (const raw of savedTasks) {
      if (!raw || !raw.username || !raw.songInfo) continue
      const id = sanitizeId(raw.id)
      const savedStatus = validStatuses.has(raw.status) ? raw.status as ServerDownloadStatus : 'waiting'
      const status: ServerDownloadStatus = savedStatus === 'downloading' || savedStatus === 'tagging' ? 'waiting' : savedStatus
      const quality = String(raw.quality || raw.requestedQuality || '320k')
      const requestedQuality = String(raw.requestedQuality || quality)
      const now = Date.now()
      const createdAt = Number(raw.createdAt || now)
      const task: ServerDownloadTask = {
        id,
        username: String(raw.username),
        songKey: String(raw.songKey || `${fileCache.normalizeSongId(raw.songInfo)}_${requestedQuality}`),
        activeSongKey: status === 'waiting' ? undefined : raw.activeSongKey ? String(raw.activeSongKey) : undefined,
        songInfo: raw.songInfo,
        quality: status === 'waiting' ? requestedQuality : quality,
        requestedQuality,
        status,
        progress: status === 'waiting' ? 0 : Number(raw.progress || 0),
        total: status === 'waiting' ? 0 : Number(raw.total || 0),
        received: status === 'waiting' ? 0 : Number(raw.received || 0),
        speed: 0,
        errorMsg: status === 'waiting' ? '' : String(raw.errorMsg || ''),
        enableOnlyDownloadMode: !!raw.enableOnlyDownloadMode,
        cacheLyric: raw.cacheLyric !== false,
        embedLyric: raw.embedLyric !== false,
        createdAt,
        updatedAt: Number(raw.updatedAt || createdAt),
      }
      restoredTasks.push(task)
    }
    deduplicateDownloadTasks(restoredTasks)
      .forEach(task => tasks.set(taskMapKey(task.username, task.id), task))
    pruneHistory()
    console.log(`[ServerDownloadQueue] Restored ${tasks.size} persisted tasks`)
  } catch (err) {
    console.warn('[ServerDownloadQueue] Failed to restore queue:', err)
  }
}

const getPublicTask = (task: ServerDownloadTask) => {
  const live = task.status === 'downloading' && task.activeSongKey && controllers.has(taskMapKey(task.username, task.id))
    ? fileCache.cacheProgress.get(task.activeSongKey)
    : undefined
  // A transient cache progress entry must never downgrade a terminal queue
  // state. In particular, lyric/tagging cleanup can outlive the audio task.
  const liveStatus = ['downloading', 'tagging', 'finished', 'exists'].includes(String(live?.status))
    ? live?.status as ServerDownloadStatus
    : undefined
  return {
    id: task.id,
    songKey: task.activeSongKey || task.songKey,
    songInfo: task.songInfo,
    quality: task.quality,
    requestedQuality: task.requestedQuality,
    enableOnlyDownloadMode: task.enableOnlyDownloadMode,
    status: liveStatus || task.status,
    progress: Number(live?.progress ?? task.progress ?? 0),
    total: Number(live?.total ?? task.total ?? 0),
    received: Number(live?.received ?? task.received ?? 0),
    speed: Number(live?.speed ?? task.speed ?? 0),
    errorMsg: String(live?.errorMsg || task.errorMsg || ''),
    createdAt: task.createdAt,
    updatedAt: Number(live?.updatedAt || task.updatedAt),
  }
}

const runTask = async (task: ServerDownloadTask) => {
  if (!resolver || task.status !== 'waiting') return
  const key = taskMapKey(task.username, task.id)
  const targetOnlyDownloadMode = task.enableOnlyDownloadMode === true
  const controller = new AbortController()
  controllers.set(key, controller)
  task.status = 'downloading'
  task.progress = 0
  task.total = 0
  task.received = 0
  task.speed = 0
  task.errorMsg = ''
  task.updatedAt = Date.now()
  scheduleSave()

  try {
    const resolved = await resolver(task)
    if (controller.signal.aborted) return
    if (!resolved?.url) throw new Error('无法解析下载地址')
    task.songInfo = resolved.songInfo || task.songInfo
    task.quality = resolved.quality || task.requestedQuality
    task.activeSongKey = fileCache.normalizeSongId(task.songInfo) + '_' + task.quality
    task.updatedAt = Date.now()
    scheduleSave()

    await fileCache.downloadAndCache(task.songInfo, resolved.url, task.quality, task.username, controller.signal,
      targetOnlyDownloadMode, task.cacheLyric, task.embedLyric, {
        requestedSource: resolved.requestedSource,
        downloadSource: resolved.downloadSource,
        sourceName: resolved.sourceName,
      })

    if (controller.signal.aborted) return

    // If a new request changed the desired target while this download was in
    // flight, keep the same public task and run it once more for that target.
    if (task.enableOnlyDownloadMode !== targetOnlyDownloadMode) {
      task.status = 'waiting'
      task.quality = task.requestedQuality
      task.progress = 0
      task.total = 0
      task.received = 0
      task.speed = 0
      task.errorMsg = ''
      task.activeSongKey = undefined
      task.updatedAt = Date.now()
      return
    }

    const progress = fileCache.cacheProgress.get(task.activeSongKey)
    task.status = progress?.status === 'exists' ? 'exists' : 'finished'
    task.progress = 100
    task.total = Number(progress?.total || progress?.received || task.total || 0)
    task.received = Number(progress?.received || task.total || 0)
    task.speed = 0
    task.errorMsg = ''
  } catch (err: any) {
    if (controller.signal.aborted || err?.message === 'Aborted') {
      task.status = 'paused'
      task.errorMsg = '已暂停'
    } else {
      task.status = 'error'
      task.errorMsg = err?.message || '下载失败'
    }
    task.speed = 0
  } finally {
    controllers.delete(key)
    task.updatedAt = Date.now()
    scheduleSave()
    void processQueue()
  }
}

const processQueue = async () => {
  if (processing || !resolver) return
  processing = true
  try {
    while (true) {
      const activeByUser = new Map<string, number>()
      const activeIdentities = new Set<string>()
      for (const key of controllers.keys()) {
        const activeTask = tasks.get(key)
        const username = activeTask?.username
        if (!activeTask || !username) continue
        activeByUser.set(username, (activeByUser.get(username) || 0) + 1)
        activeIdentities.add(getTaskIdentity(activeTask))
      }
      const next = Array.from(tasks.values()).find(task => (
        task.status === 'waiting' &&
        (activeByUser.get(task.username) || 0) < getConcurrency(task.username) &&
        !activeIdentities.has(getTaskIdentity(task))
      ))
      if (!next) break
      void runTask(next)
    }
  } finally {
    processing = false
  }
}

export const setConcurrency = (username: string, value: unknown) => {
  const concurrency = normalizeConcurrency(value)
  concurrencyByUser.set(username, concurrency)
  saveNow()
  void processQueue()
  return concurrency
}

export const initialize = (downloadResolver: DownloadResolver) => {
  resolver = downloadResolver
  if (!initialized) {
    initialized = true
    loadTasks()
    saveNow()
  }
  void processQueue()
}

export const enqueue = (username: string, inputs: QueueInput[]) => {
  if (inputs.length > 100) throw new Error('Too many tasks in one request')
  deduplicateTasksInMemory()
  const pendingCount = Array.from(tasks.values()).filter(task => task.username === username && resumableStatuses.has(task.status)).length
  if (pendingCount + inputs.length > MAX_PENDING_TASKS_PER_USER) throw new Error('Too many pending download tasks')
  const added: ServerDownloadTask[] = []
  for (const input of inputs) {
    if (!input?.songInfo) continue
    const id = sanitizeId(input.id)
    const key = taskMapKey(username, id)
    const quality = String(input.quality || '320k')
    const existing = tasks.get(key) || Array.from(tasks.values()).find(task => (
      task.username === username && getTaskIdentity(task) === getTaskIdentity({
        username,
        songInfo: input.songInfo,
        quality,
        requestedQuality: quality,
        songKey: '',
        activeSongKey: undefined,
      })
    ))
    if (existing) {
      if (['waiting', 'downloading', 'tagging'].includes(existing.status)) {
        // Keep one queue record per song/quality (and therefore one public ID),
        // but remember a newly requested /music target even when the current
        // download is already running. runTask will perform the second step
        // after the current target finishes.
        const targetOnlyDownloadMode = input.enableOnlyDownloadMode === true
        if (existing.enableOnlyDownloadMode !== targetOnlyDownloadMode) {
          existing.enableOnlyDownloadMode = targetOnlyDownloadMode
          existing.updatedAt = Date.now()
          scheduleSave()
        }
        continue
      }

      const now = Date.now()
      existing.songKey = fileCache.normalizeSongId(input.songInfo) + '_' + quality
      existing.activeSongKey = undefined
      existing.songInfo = input.songInfo
      existing.quality = quality
      existing.requestedQuality = quality
      existing.status = 'waiting'
      existing.progress = 0
      existing.total = 0
      existing.received = 0
      existing.speed = 0
      existing.errorMsg = ''
      existing.enableOnlyDownloadMode = !!input.enableOnlyDownloadMode
      existing.cacheLyric = input.cacheLyric !== false
      existing.embedLyric = input.embedLyric !== false
      existing.createdAt = now
      existing.updatedAt = now
      added.push(existing)
      continue
    }
    const now = Date.now()
    const task: ServerDownloadTask = {
      id, username,
      songKey: fileCache.normalizeSongId(input.songInfo) + '_' + quality,
      songInfo: input.songInfo,
      quality,
      requestedQuality: quality,
      status: 'waiting', progress: 0, total: 0, received: 0, speed: 0, errorMsg: '',
      enableOnlyDownloadMode: !!input.enableOnlyDownloadMode,
      cacheLyric: input.cacheLyric !== false,
      embedLyric: input.embedLyric !== false,
      createdAt: now, updatedAt: now,
    }
    tasks.set(key, task)
    added.push(task)
  }
  saveNow()
  void processQueue()
  return added.map(task => getPublicTask(task))
}

export const list = (username: string) => {
  if (deduplicateTasksInMemory()) saveNow()
  return Array.from(tasks.values())
    .filter(task => task.username === username)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(task => getPublicTask(task))
}

export const pause = (username: string, id?: string) => {
  for (const task of tasks.values()) {
    if (task.username !== username || (id && task.id !== id)) continue
    if (!['waiting', 'downloading', 'tagging'].includes(task.status)) continue
    task.status = 'paused'
    task.speed = 0
    task.errorMsg = '已暂停'
    task.updatedAt = Date.now()
    controllers.get(taskMapKey(username, task.id))?.abort()
  }
  saveNow()
}

export const resume = (username: string, id?: string) => {
  for (const task of tasks.values()) {
    if (task.username !== username || (id && task.id !== id)) continue
    if (task.status !== 'paused' && task.status !== 'error') continue
    task.status = 'waiting'
    task.progress = 0
    task.total = 0
    task.received = 0
    task.speed = 0
    task.errorMsg = ''
    task.activeSongKey = undefined
    task.quality = task.requestedQuality
    task.updatedAt = Date.now()
  }
  saveNow()
  void processQueue()
}

export const remove = (username: string, options: { id?: string; all?: boolean; completed?: boolean }) => {
  for (const [key, task] of tasks) {
    if (task.username !== username) continue
    const shouldRemove = options.all || (options.id && task.id === options.id) || (options.completed && ['finished', 'exists'].includes(task.status))
    if (!shouldRemove) continue
    controllers.get(key)?.abort()
    tasks.delete(key)
  }
  saveNow()
  void processQueue()
}
