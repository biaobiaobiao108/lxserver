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
    ip ||= headers.get('x-real-ip') || '127.0.0.1'
  } else {
    // IncomingMessage
    ip = getIP(reqOrIp as http.IncomingMessage)
  }
  return ip && (store.get<number>(ip) ?? 0) < 10 ? ip : null
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
      const num = store.get<number>(ip) ?? 0
      // if (num > 20) return
      store.set(ip, num + 1)
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
  let ip = getAvailableIP(typeof reqOrUrl === 'object' ? reqOrUrl : remoteAddress || '127.0.0.1')
  if (ip) {
    let urlString = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url || ''
    const [pathPart, queryPart] = urlString.split('?')
    const query = querystring.parse(queryPart || '')
    const i = query.i
    const t = query.t
    if (typeof i == 'string' && typeof t == 'string' && verifyConnection(t, i)) {
      // 验证 URL 路径中的用户名是否与连接的客户端所属用户一致
      if (global.lx.config['user.enablePath']) {
        const path = pathPart || ''
        const pathParts = path.split('/').filter(p => p)
        // 假设路径格式为 /<username>
        // 解码 URL 编码的用户名
        const urlUserName = pathParts[0] ? decodeURIComponent(pathParts[0]) : null
        const clientUserName = getUserName(i)

        if (urlUserName && urlUserName !== 'socket' && clientUserName && urlUserName !== clientUserName) {
          // 如果路径中有用户名，且与客户端所属用户不一致，则拒绝连接
          throw new Error('User mismatch')
        }
      }
      return
    }

    const num = store.get<number>(ip) ?? 0
    store.set(ip, num + 1)
  }
  throw new Error('failed')
}

export const SESSION_COOKIE_NAME = 'lx_player_session'
const playerSessions = new Map<string, { createdAt: number }>()
const PLAYER_SESSION_TTL = 24 * 60 * 60 * 1000

/** 生成新的播放器会话 ID */
export const createPlayerSession = (): string => {
  const sessionId = crypto.randomBytes(32).toString('hex')
  playerSessions.set(sessionId, { createdAt: Date.now() })
  return sessionId
}

/** 移除播放器会话 */
export const removePlayerSession = (sessionId: string): void => {
  playerSessions.delete(sessionId)
}

/** 校验会话有效性 */
export const checkPlayerAuthSession = (cookies: Record<string, string>): boolean => {
  if (!global.lx.config?.['player.enableAuth']) return true
  const sessionId = cookies[SESSION_COOKIE_NAME]
  if (!sessionId) return false
  const session = playerSessions.get(sessionId)
  if (!session) return false
  if (Date.now() - session.createdAt > PLAYER_SESSION_TTL) {
    playerSessions.delete(sessionId)
    return false
  }
  return true
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

  if (typeof headerAuth === 'string' && headerAuth === configuredPassword) {
    return true
  }

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
      if (typeof queryAuth === 'string' && queryAuth === configuredPassword) {
        return true
      }
    }
  }
  return false
}


