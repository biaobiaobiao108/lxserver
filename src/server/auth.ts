import crypto from 'node:crypto'
import type http from 'http'
import { SYNC_CODE } from '@/constants'
import {
  aesEncrypt,
  aesDecrypt,
  rsaEncrypt,
  getIP,
} from '@/utils/tools'
import querystring from 'node:querystring'
import store from '@/utils/cache'
import { getUserSpace, getUserName, setUserName, createClientKeyInfo } from '@/user'
import { toMD5 } from '@/utils'
import { getDb } from '@/database'

/** 同步协议（LX 客户端）鉴权失败计数：滑动窗口，避免一次失误导致长时间无法连接 */
const SYNC_AUTH_WINDOW_MS = 15 * 60 * 1000
const SYNC_AUTH_MAX_FAILURES = 10

interface SyncAuthFailureRecord {
  count: number
  firstAt: number
}

const readSyncAuthFailure = (ip: string): SyncAuthFailureRecord | null => {
  const record = store.get<SyncAuthFailureRecord>(ip)
  if (!record) return null
  if (Date.now() - record.firstAt > SYNC_AUTH_WINDOW_MS) {
    store.delete(ip)
    return null
  }
  return record
}

const isSyncAuthBlocked = (ip: string): boolean => {
  const record = readSyncAuthFailure(ip)
  return !!record && record.count >= SYNC_AUTH_MAX_FAILURES
}

const recordSyncAuthFailure = (ip: string): void => {
  const record = readSyncAuthFailure(ip)
  store.set(ip, record
    ? { count: record.count + 1, firstAt: record.firstAt }
    : { count: 1, firstAt: Date.now() })
}

const clearSyncAuthFailures = (ip: string): void => {
  store.delete(ip)
}

export const getAvailableIP = (reqOrIp: http.IncomingMessage | Request | string) => {
  let ip: string | undefined
  if (typeof reqOrIp === 'string') {
    ip = reqOrIp
  } else if ('headers' in reqOrIp && typeof (reqOrIp.headers as any)?.get === 'function') {
    // Web Request
    const headers = reqOrIp.headers as Headers
    if (global.lx?.config?.['proxy.enabled']) {
      const headerKey = (global.lx.config['proxy.header'] || 'x-forwarded-for').toLowerCase()
      const proxyIp = headers.get(headerKey)
      if (proxyIp) ip = proxyIp.split(',')[0].trim()
    }
    // Only trust forwarding headers when the server is explicitly behind a
    // configured trusted proxy. Otherwise clients can spoof them.
    ip ||= '127.0.0.1'
  } else {
    // IncomingMessage
    ip = getIP(reqOrIp as http.IncomingMessage)
  }
  return ip && !isSyncAuthBlocked(ip) ? ip : null
}

const verifyByKey = (encryptMsg: string, userId: string, targetUserName?: string) => {
  const userName = getUserName(userId)
  if (!userName) return null

  // 如果指定了目标用户名（通过URL路径），则必须匹配
  if (global.lx.config['user.enablePath'] && targetUserName && userName !== targetUserName) {
    return null
  }

  const userSpace = getUserSpace(userName)
  const keyInfo = userSpace.dataManage.getClientKeyInfo(userId)
  if (!keyInfo) return null
  let text
  try {
    text = aesDecrypt(encryptMsg, keyInfo.key)
  } catch (err) {
    return null
  }
  // console.log(text)
  if (text.startsWith(SYNC_CODE.authMsg)) {
    const deviceName = text.replace(SYNC_CODE.authMsg, '') || 'Unknown'
    if (deviceName != keyInfo.deviceName) {
      keyInfo.deviceName = deviceName
      userSpace.dataManage.saveClientKeyInfo(keyInfo)
    }
    return aesEncrypt(SYNC_CODE.helloMsg, keyInfo.key)
  }
  return null
}

const verifyByCode = (encryptMsg: string, users: LX.Config['users'], targetUserName?: string) => {
  for (const userInfo of users) {
    if (targetUserName && userInfo.name !== targetUserName) continue
    let key = toMD5(userInfo.password).substring(0, 16)
    // const iv = Buffer.from(key.split('').reverse().join('')).toString('base64')
    key = Buffer.from(key).toString('base64')
    // console.log(req.headers.m, authCode, key)
    let text
    try {
      text = aesDecrypt(encryptMsg, key)
    } catch { continue }
    // console.log(text)
    if (text.startsWith(SYNC_CODE.authMsg)) {
      const data = text.split('\n')
      const publicKey = `-----BEGIN PUBLIC KEY-----\n${data[1]}\n-----END PUBLIC KEY-----`
      const deviceName = data[2] || 'Unknown'
      const isMobile = data[3] == 'lx_music_mobile'
      const keyInfo = createClientKeyInfo(deviceName, isMobile)
      const userSpace = getUserSpace(userInfo.name)
      userSpace.dataManage.saveClientKeyInfo(keyInfo)
      setUserName(keyInfo.clientId, userInfo.name)
      return rsaEncrypt(Buffer.from(JSON.stringify({
        clientId: keyInfo.clientId,
        key: keyInfo.key,
        serverName: global.lx.config.serverName,
      })), publicKey)
    }
  }
  return null
}

export const authCode = async (req: http.IncomingMessage, res: http.ServerResponse, users: LX.Config['users'], targetUserName?: string) => {
  let code = 401
  let msg: string = SYNC_CODE.msgAuthFailed

  let ip = getAvailableIP(req)
  if (ip) {
    if (typeof req.headers.m == 'string' && req.headers.m) {
      const userId = req.headers.i
      const _msg = typeof userId == 'string' && userId
        ? verifyByKey(req.headers.m, userId, targetUserName)
        : verifyByCode(req.headers.m, users, targetUserName)
      if (_msg != null) {
        msg = _msg
        code = 200
      }
    }

    if (code != 200) {
      recordSyncAuthFailure(ip)
    } else {
      // 一旦成功登录就清空失败计数，避免客户端重试期间被持续拉黑
      clearSyncAuthFailures(ip)
    }
  } else {
    code = 403
    msg = SYNC_CODE.msgBlockedIp
  }
  // console.log(req.headers)

  res.writeHead(code)
  res.end(msg)
}

const verifyConnection = (encryptMsg: string, userId: string) => {
  const userName = getUserName(userId)
  // console.log(userName)
  if (!userName) return false
  const userSpace = getUserSpace(userName)
  const keyInfo = userSpace.dataManage.getClientKeyInfo(userId)
  if (!keyInfo) return false
  let text
  try {
    text = aesDecrypt(encryptMsg, keyInfo.key)
  } catch (err) {
    return false
  }
  // console.log(text)
  return text == SYNC_CODE.msgConnect
}
export const authConnect = async (reqOrUrl: http.IncomingMessage | Request | string, remoteAddress?: string) => {
  let ip = getAvailableIP(remoteAddress || reqOrUrl)
  if (ip) {
    const urlString = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url || ''
    const url = new URL(urlString, 'http://localhost')
    const query = querystring.parse(url.search.slice(1))
    const i = query.i
    const t = query.t
    if (typeof i == 'string' && typeof t == 'string' && verifyConnection(t, i)) {
      // 验证 URL 路径中的用户名是否与连接的客户端所属用户一致
      if (global.lx.config['user.enablePath']) {
        const pathParts = url.pathname.split('/').filter(p => p)
        // 假设路径格式为 /<username>
        // 解码 URL 编码的用户名
        const urlUserName = pathParts[0] ? decodeURIComponent(pathParts[0]) : null
        const clientUserName = getUserName(i)

        if (urlUserName && urlUserName !== 'socket' && clientUserName && urlUserName !== clientUserName) {
          // 如果路径中有用户名，且与客户端所属用户不一致，则拒绝连接
          throw new Error('User mismatch')
        }
      }
      clearSyncAuthFailures(ip)
      return
    }

    recordSyncAuthFailure(ip)
  }
  throw new Error('failed')
}

export const SESSION_COOKIE_NAME = 'lx_player_session'
const playerSessions = new Map<string, { createdAt: number }>()
export const PLAYER_SESSION_TTL = 30 * 24 * 60 * 60 * 1000
const MAX_PLAYER_SESSIONS = 10_000

const hashPlayerSession = (sessionId: string): string => (
  crypto.createHash('sha256').update(sessionId).digest('hex')
)

const persistPlayerSession = (sessionId: string, createdAt: number): void => {
  try {
    getDb().run(
      'INSERT OR REPLACE INTO player_sessions (session_hash, created_at) VALUES (?, ?)',
      [hashPlayerSession(sessionId), createdAt]
    )
  } catch (error) {
    console.error('[Auth] 播放器会话持久化失败:', error)
  }
}

const deletePersistedPlayerSession = (sessionId: string): void => {
  try {
    getDb().run('DELETE FROM player_sessions WHERE session_hash = ?', [hashPlayerSession(sessionId)])
  } catch (error) {
    console.error('[Auth] 播放器会话清理失败:', error)
  }
}

const prunePersistedPlayerSessions = (now = Date.now()): void => {
  try {
    getDb().run('DELETE FROM player_sessions WHERE created_at <= ?', [now - PLAYER_SESSION_TTL])
  } catch (error) {
    console.error('[Auth] 过期播放器会话清理失败:', error)
  }
}

export const ADMIN_SESSION_COOKIE_NAME = 'lx_admin_session'
export const USER_SESSION_COOKIE_NAME = 'lx_user_session'
const adminSessions = new Map<string, number>()
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000
const MAX_ADMIN_SESSIONS = 10000

const pruneExpiredAdminSessions = (now = Date.now()): void => {
  for (const [sessionId, expiresAt] of adminSessions) {
    if (expiresAt <= now) adminSessions.delete(sessionId)
  }
  while (adminSessions.size > MAX_ADMIN_SESSIONS) {
    const oldest = adminSessions.keys().next().value
    if (!oldest) break
    adminSessions.delete(oldest)
  }
}

export const createAdminSession = (): string => {
  pruneExpiredAdminSessions()
  const sessionId = crypto.randomBytes(32).toString('hex')
  adminSessions.set(sessionId, Date.now() + ADMIN_SESSION_TTL)
  return sessionId
}

export const removeAdminSession = (sessionId: string): void => {
  adminSessions.delete(sessionId)
}

export const getCookieValue = (req: http.IncomingMessage | Request | { headers: Record<string, any> }, name: string): string | null => {
  let cookieHeader: string | null = null
  if ('headers' in req) {
    if (typeof (req.headers as any).get === 'function') cookieHeader = (req.headers as Headers).get('cookie')
    else cookieHeader = (req.headers as any).cookie || null
  }
  if (!cookieHeader) return null
  const item = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))
  if (!item) return null
  try {
    return decodeURIComponent(item.slice(name.length + 1))
  } catch {
    return null
  }
}

export const checkAdminSession = (req: http.IncomingMessage | Request | { headers: Record<string, any> }): boolean => {
  pruneExpiredAdminSessions()
  const sessionId = getCookieValue(req, ADMIN_SESSION_COOKIE_NAME)
  if (!sessionId) return false
  const expiresAt = adminSessions.get(sessionId)
  if (!expiresAt || expiresAt <= Date.now()) {
    adminSessions.delete(sessionId)
    return false
  }
  return true
}

const loginFailures = new Map<string, number[]>()
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_FAILURES = 10
const MAX_LOGIN_FAILURE_KEYS = 10_000

const pruneLoginFailures = (now = Date.now()): void => {
  for (const [ip, failures] of loginFailures) {
    const active = failures.filter(timestamp => now - timestamp < LOGIN_WINDOW_MS)
    if (active.length === 0) loginFailures.delete(ip)
    else loginFailures.set(ip, active)
  }
  while (loginFailures.size > MAX_LOGIN_FAILURE_KEYS) {
    const oldest = loginFailures.keys().next().value
    if (!oldest) break
    loginFailures.delete(oldest)
  }
}

export const isLoginRateLimited = (ip: string): boolean => {
  const now = Date.now()
  pruneLoginFailures(now)
  const failures = (loginFailures.get(ip) || []).filter(timestamp => now - timestamp < LOGIN_WINDOW_MS)
  loginFailures.set(ip, failures)
  return failures.length >= MAX_LOGIN_FAILURES
}

export const recordLoginFailure = (ip: string): void => {
  const now = Date.now()
  pruneLoginFailures(now)
  const failures = (loginFailures.get(ip) || []).filter(timestamp => now - timestamp < LOGIN_WINDOW_MS)
  failures.push(now)
  loginFailures.set(ip, failures)
  pruneLoginFailures(now)
}

export const clearLoginFailures = (ip: string): void => {
  loginFailures.delete(ip)
}

export const safeStringEqual = (left: unknown, right: unknown): boolean => {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length === 0 || right.length === 0) return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

const pruneExpiredPlayerSessions = (now = Date.now()) => {
  for (const [sessionId, session] of playerSessions) {
    if (now - session.createdAt > PLAYER_SESSION_TTL) playerSessions.delete(sessionId)
  }
  prunePersistedPlayerSessions(now)
  while (playerSessions.size > MAX_PLAYER_SESSIONS) {
    const oldest = playerSessions.keys().next().value
    if (!oldest) break
    playerSessions.delete(oldest)
  }
}

/** 生成新的播放器会话 ID */
export const createPlayerSession = (): string => {
  pruneExpiredPlayerSessions()
  const sessionId = crypto.randomBytes(32).toString('hex')
  const createdAt = Date.now()
  playerSessions.set(sessionId, { createdAt })
  persistPlayerSession(sessionId, createdAt)
  return sessionId
}

/** 移除播放器会话 */
export const removePlayerSession = (sessionId: string): void => {
  playerSessions.delete(sessionId)
  deletePersistedPlayerSession(sessionId)
}

/** 校验会话有效性 */
export const checkPlayerAuthSession = (cookies: Record<string, string>): boolean => {
  if (!global.lx.config?.['player.enableAuth']) return true
  pruneExpiredPlayerSessions()
  const sessionId = cookies[SESSION_COOKIE_NAME]
  if (!sessionId) return false
  const session = playerSessions.get(sessionId)
  const now = Date.now()
  if (session && now - session.createdAt <= PLAYER_SESSION_TTL) return true
  if (session) {
    playerSessions.delete(sessionId)
    deletePersistedPlayerSession(sessionId)
  }

  try {
    const persisted = getDb().query<{ created_at: number }, [string]>(
      'SELECT created_at FROM player_sessions WHERE session_hash = ?'
    ).get(hashPlayerSession(sessionId))
    if (!persisted || now - persisted.created_at > PLAYER_SESSION_TTL) {
      deletePersistedPlayerSession(sessionId)
      return false
    }
    playerSessions.set(sessionId, { createdAt: persisted.created_at })
    return true
  } catch (error) {
    console.error('[Auth] 播放器会话读取失败:', error)
    return false
  }
}

export const verifyAdminAuth = (
  req: http.IncomingMessage | Request | { headers: Record<string, any> },
  allowQueryAuth = false,
  urlObj?: URL
): boolean => {
  const configuredPassword = global.lx.config?.['frontend.password']
  if (!configuredPassword || typeof configuredPassword !== 'string' || configuredPassword.trim() === '') {
    return false
  }

  let headerAuth: string | null = null
  if ('headers' in req) {
    if (typeof (req.headers as any).get === 'function') {
      headerAuth = (req.headers as Headers).get('x-frontend-auth')
    } else {
      headerAuth = (req.headers as any)['x-frontend-auth']
    }
  }

  if (typeof headerAuth === 'string' && safeStringEqual(headerAuth, configuredPassword)) {
    return true
  }

  if (checkAdminSession(req)) return true

  if (allowQueryAuth) {
    let searchParams: URLSearchParams | null = null
    if (urlObj) {
      searchParams = urlObj.searchParams
    } else if ('url' in req && typeof (req as any).url === 'string') {
      try {
        const parsed = new URL((req as any).url, 'http://localhost')
        searchParams = parsed.searchParams
      } catch { }
    }

    if (searchParams) {
      const queryAuth = searchParams.get('auth')
      if (typeof queryAuth === 'string' && safeStringEqual(queryAuth, configuredPassword)) {
        return true
      }
    }
  }
  return false
}
