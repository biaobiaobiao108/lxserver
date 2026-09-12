import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import { Router, type HttpContext } from '../core'
import { toUserMessage } from '../core/context'
import {
  verifyAdminAuth,
  createAdminSession,
  removeAdminSession,
  ADMIN_SESSION_COOKIE_NAME,
  checkPlayerAuthSession,
  createPlayerSession,
  removePlayerSession,
  SESSION_COOKIE_NAME,
  PLAYER_SESSION_TTL,
  clearLoginFailures,
  isLoginRateLimited,
  recordLoginFailure,
  safeStringEqual,
  getCookieValue,
  USER_SESSION_COOKIE_NAME,
} from '../auth'
import { File } from '@/constants'
import { getUserDirname } from '@/user'
import { tokenLog, loginLog } from '@/utils/log4js'
import { getDb } from '@/database'

// ===== User Token Store Interfaces =====
export interface UserToken {
  token: string
  name: string
  createdAt: number
  expiresAt: number | null
  lastUsed?: number
  disabled?: boolean
}

export interface UserTokenConfig {
  enabled: boolean
  tokens: UserToken[]
}

/** 用户 Token 存储：token → { username, createdAt } */
export const userSessions = new Map<string, { username: string; createdAt: number }>()
export const USER_SESSION_TTL = 7 * 24 * 60 * 60 * 1000 // 7天
const MAX_USER_SESSIONS = 10_000
const MAX_PERSISTENT_TOKENS_PER_USER = 100
const MAX_TOKEN_NAME_LENGTH = 128
const MAX_TOKEN_LIFETIME_MS = 10 * 365 * 24 * 60 * 60 * 1000

const hashUserSession = (sessionId: string): string => (
  crypto.createHash('sha256').update(sessionId).digest('hex')
)

const persistUserSession = (sessionId: string, username: string, createdAt: number): void => {
  try {
    getDb().run(
      'INSERT OR REPLACE INTO user_sessions (session_hash, user_name, created_at) VALUES (?, ?, ?)',
      [hashUserSession(sessionId), username, createdAt]
    )
  } catch (error) {
    console.error('[Auth] 用户会话持久化失败:', error)
  }
}

const deletePersistedUserSession = (sessionId: string): void => {
  try {
    getDb().run('DELETE FROM user_sessions WHERE session_hash = ?', [hashUserSession(sessionId)])
  } catch (error) {
    console.error('[Auth] 用户会话清理失败:', error)
  }
}

const prunePersistedUserSessions = (now = Date.now()): void => {
  try {
    getDb().run('DELETE FROM user_sessions WHERE created_at <= ?', [now - USER_SESSION_TTL])
  } catch (error) {
    console.error('[Auth] 过期用户会话清理失败:', error)
  }
}

const normalizeTokenName = (value: unknown): string => {
  const name = typeof value === 'string' ? value.trim() : ''
  return (name || '未命名 Token').slice(0, MAX_TOKEN_NAME_LENGTH)
}

const parseTokenExpiry = (expireDays: unknown, expiresAt: unknown, now = Date.now()): number | null => {
  if (expiresAt !== undefined) {
    if (expiresAt === null) return null
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) throw new Error('Invalid expiration time')
    if (expiresAt < now || expiresAt > now + MAX_TOKEN_LIFETIME_MS) throw new Error('Expiration time is out of range')
    return Math.trunc(expiresAt)
  }
  if (expireDays !== undefined) {
    if (typeof expireDays !== 'number' || !Number.isFinite(expireDays) || expireDays < 0 || expireDays > 3650) {
      throw new Error('Expiration days are out of range')
    }
    return expireDays === 0 ? null : now + Math.trunc(expireDays * 24 * 60 * 60 * 1000)
  }
  return null
}

const pruneExpiredUserSessions = (now = Date.now()) => {
  for (const [token, session] of userSessions) {
    if (now - session.createdAt > USER_SESSION_TTL) {
      userSessions.delete(token)
      deletePersistedUserSession(token)
    }
  }
  prunePersistedUserSessions(now)
}

const issueUserSession = (username: string): string => {
  pruneExpiredUserSessions()
  if (userSessions.size >= MAX_USER_SESSIONS) {
    const oldest = [...userSessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0]
    if (oldest) userSessions.delete(oldest[0])
  }
  const token = crypto.randomBytes(32).toString('hex')
  const createdAt = Date.now()
  userSessions.set(token, { username, createdAt })
  persistUserSession(token, username, createdAt)
  return token
}

/** 持久化 Token 快速查找缓存：token → username */
export const persistentTokens = new Map<string, string>()

/** 持久化 Token 元数据缓存：token → token 对象 */
export const persistentTokenMeta = new Map<string, {
  name: string
  token: string
  disabled?: boolean
  expiresAt?: number
  lastUsed?: number
}>()

/** lastUsed 防抖写盘队列：username → debounce timer */
const persistentTokenSaveQueue = new Map<string, ReturnType<typeof setTimeout>>()

/** Discard pre-restore state, including delayed writes which could overwrite restored tokens. */
export const reloadUserAuthAfterRestore = (): void => {
  for (const timer of persistentTokenSaveQueue.values()) clearTimeout(timer)
  persistentTokenSaveQueue.clear()
  userSessions.clear()
  persistentTokens.clear()
  persistentTokenMeta.clear()
  for (const user of global.lx?.config?.users || []) saveUserTokenConfig(user.name, getUserTokenConfig(user.name))
}

/** Revoke all credentials and pending token writes when an account is removed. */
export const revokeUserAuth = (username: string): void => {
  getDb().run('DELETE FROM user_sessions WHERE user_name = ?', [username])
  for (const [token, session] of userSessions) {
    if (session.username === username) userSessions.delete(token)
  }
  for (const [token, owner] of persistentTokens) {
    if (owner !== username) continue
    persistentTokens.delete(token)
    persistentTokenMeta.delete(token)
  }
  const timer = persistentTokenSaveQueue.get(username)
  if (timer) clearTimeout(timer)
  persistentTokenSaveQueue.delete(username)
}

const isActiveUser = (username: string): boolean => {
  if (global.lx?.config?.users?.some(user => user.name === username)) return true
  revokeUserAuth(username)
  return false
}

/** 触发防抖写盘，10s 内的高频更新只写一次 */
const scheduleSaveTokenConfig = (username: string) => {
  if (persistentTokenSaveQueue.has(username)) clearTimeout(persistentTokenSaveQueue.get(username)!)
  const timer = setTimeout(() => {
    persistentTokenSaveQueue.delete(username)
    const tokens: any[] = []
    for (const [, meta] of persistentTokenMeta) {
      if (persistentTokens.get(meta.token) === username) {
        tokens.push({ ...meta })
      }
    }
    const existing = getUserTokenConfig(username)
    const existingNonActive = existing.tokens.filter(t => !persistentTokenMeta.has(t.token))
    const merged = [...existingNonActive, ...tokens]
    const config = { ...existing, tokens: merged }
    try {
      const db = getDb()
      db.run(
        'INSERT OR REPLACE INTO user_settings (user_name, key, value, updated_at) VALUES (?, ?, ?, ?)',
        [username, 'tokens', JSON.stringify(config), Date.now()]
      )
    } catch (err) {
      console.error('[Token] 写数据库失败:', err)
    }
  }, 10_000)
  persistentTokenSaveQueue.set(username, timer)
}

export const getUserTokenConfig = (username: string): UserTokenConfig => {
  try {
    const db = getDb()
    const row = db.query<{ value: string }, [string, string]>(
      'SELECT value FROM user_settings WHERE user_name = ? AND key = ?'
    ).get(username, 'tokens')

    if (row) {
      return JSON.parse(row.value)
    }
  } catch (err) {
    console.error('[Token] 从数据库读取失败:', err)
  }
  return { enabled: false, tokens: [] }
}

export const saveUserTokenConfig = (username: string, config: UserTokenConfig) => {
  try {
    const db = getDb()
    db.run(
      'INSERT OR REPLACE INTO user_settings (user_name, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [username, 'tokens', JSON.stringify(config), Date.now()]
    )
  } catch (err) {
    console.error('[Token] 保存到数据库失败:', err)
  }

  // 更新内存缓存（清理该用户旧条目）
  for (const [tk, name] of persistentTokens.entries()) {
    if (name === username) {
      persistentTokens.delete(tk)
      persistentTokenMeta.delete(tk)
    }
  }
  // 写入新的有效 token
  if (config.enabled) {
    for (const t of config.tokens) {
      if (!t.expiresAt || t.expiresAt > Date.now()) {
        persistentTokens.set(t.token, username)
        persistentTokenMeta.set(t.token, {
          name: t.name,
          token: t.token,
          disabled: t.disabled ?? false,
          expiresAt: t.expiresAt ?? undefined,
          lastUsed: t.lastUsed,
        })
      }
    }
  }
}

// 初始化加载所有用户的持久化 Token
setTimeout(() => {
  if (global.lx?.config?.users) {
    global.lx.config.users.forEach((u: any) => saveUserTokenConfig(u.name, getUserTokenConfig(u.name)))
  }
}, 3000)

/**
 * 验证请求中的用户 Token（支持 IncomingMessage、Request 或 HttpContext）
 * 1. 优先验证内存 Session Token（网页登陆产生）
 * 2. 其次验证持久化 API Token（管理面板产生）
 */
export const verifyUserAuth = (req: IncomingMessage | Request | HttpContext | { headers: any }): string | null => {
  pruneExpiredUserSessions()
  let token: string | null = null
  let legacyUsername: string | null = null
  let legacyPassword: string | null = null
  let ip = '127.0.0.1'
  let url = ''

  if ('cookies' in req && 'remoteAddress' in req) {
    // HttpContext
    token = req.headers.get('x-user-token') ||
      req.query.get('token') ||
      req.query.get('userToken') ||
      req.cookies[USER_SESSION_COOKIE_NAME] ||
      null
    legacyUsername = req.headers.get('x-user-name')
    legacyPassword = req.headers.get('x-user-password')
    ip = req.remoteAddress
    url = req.pathname
  } else if ('headers' in req && typeof (req.headers as any).get === 'function') {
    // Web Request
    const reqUrl = new URL((req as Request).url, 'http://localhost')
    token = (req.headers as Headers).get('x-user-token') ||
      reqUrl.searchParams.get('token') ||
      reqUrl.searchParams.get('userToken') ||
      getCookieValue(req as Request, USER_SESSION_COOKIE_NAME)
    legacyUsername = (req.headers as Headers).get('x-user-name')
    legacyPassword = (req.headers as Headers).get('x-user-password')
    url = (req as Request).url
  } else if ('headers' in req) {
    // IncomingMessage
    const parsedQuery = (req as any).url ? new URL((req as any).url, 'http://localhost').searchParams : null
    token = (req.headers as any)['x-user-token'] ||
      parsedQuery?.get('token') ||
      parsedQuery?.get('userToken') ||
      getCookieValue(req as any, USER_SESSION_COOKIE_NAME)
    legacyUsername = (req.headers as any)['x-user-name']
    legacyPassword = (req.headers as any)['x-user-password']
    url = (req as any).url || ''
  }

  // 0. 旧版「用户名 + 密码」直连鉴权（无 Token 的客户端仍在发送这两个头）
  if (legacyUsername && legacyPassword) {
    const user = (global.lx?.config?.users || []).find((u: any) => u.name === legacyUsername)
    if (user && safeStringEqual(user.password, legacyPassword)) return user.name
  }

  if (token) {
    // 1. Session Token 验证
    const session = userSessions.get(token)
    if (session && Date.now() - session.createdAt <= USER_SESSION_TTL) {
      return isActiveUser(session.username) ? session.username : null
    }
    if (session) {
      userSessions.delete(token)
      deletePersistedUserSession(token)
    }

    try {
      const persisted = getDb().query<{ user_name: string; created_at: number }, [string]>(
        'SELECT user_name, created_at FROM user_sessions WHERE session_hash = ?'
      ).get(hashUserSession(token))
      if (persisted && Date.now() - persisted.created_at <= USER_SESSION_TTL) {
        if (!isActiveUser(persisted.user_name)) return null
        userSessions.set(token, {
          username: persisted.user_name,
          createdAt: persisted.created_at,
        })
        return persisted.user_name
      }
      if (persisted) deletePersistedUserSession(token)
    } catch (error) {
      console.error('[Auth] 用户会话读取失败:', error)
    }

    // 2. 持久化 API Token 验证
    const persistentUsername = persistentTokens.get(token)
    if (persistentUsername) {
      if (!isActiveUser(persistentUsername)) return null
      const meta = persistentTokenMeta.get(token)
      if (meta) {
        if (meta.disabled) {
          tokenLog.warn(`User ${persistentUsername} attempted to use DISABLED token: ${meta.name}`)
          return null
        }
        if (!meta.expiresAt || meta.expiresAt > Date.now()) {
          meta.lastUsed = Date.now()
          scheduleSaveTokenConfig(persistentUsername)

          const masked = `${meta.token.slice(0, 6)}...${meta.token.slice(-4)}`
          tokenLog.info(`API Token [${meta.name}] (${masked}) used by ${persistentUsername} from ${ip} to access ${url}`)

          return persistentUsername
        } else {
          persistentTokens.delete(token)
          persistentTokenMeta.delete(token)
        }
      }
    }
    return null
  }
  return null
}

/** 登录限流统一响应：给出明确的中文原因与等待时间，避免用户反复重试 */
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60
const loginRateLimitedResponse = (ctx: HttpContext) =>
  ctx.fail(429, '登录失败次数过多，已暂时限制登录，请 15 分钟后再试', {
    retryAfter: LOGIN_RATE_LIMIT_WINDOW_SECONDS,
  })

/** 注册统一鉴权与 Token 管理路由 */
export const createAuthRouter = (): Router => {
  const router = new Router()

  // 0. Web 播放器公共配置 API
  router.get('/api/music/config', (ctx) => {
    const config = (global.lx?.config ?? {}) as any
    return ctx.json({
      'player.enableAuth': config['player.enableAuth'] || false,
      'user.enablePublicRestriction': config['user.enablePublicRestriction'] || false,
      'user.enablePublicFavorites': config['user.enablePublicFavorites'] || false,
      'user.enablePublicNonAdminAccess': config['user.enablePublicNonAdminAccess'] || false,
      'user.enablePublicNonAdminLocalMusic': config['user.enablePublicNonAdminLocalMusic'] || false,
    }, 200, {
      'Cache-Control': 'no-cache',
    })
  })

  // 1. 管理后台密码校验与老版管理员登录
  router.post('/api/admin/verify', (ctx) => {
    const ip = ctx.remoteAddress || 'unknown'
    if (isLoginRateLimited(ip)) return loginRateLimitedResponse(ctx)
    if (verifyAdminAuth(ctx.request)) {
      clearLoginFailures(ip)
      const sessionId = createAdminSession()
      return ctx.json({ success: true }, 200, {
        'Set-Cookie': `${ADMIN_SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${8 * 60 * 60}${ctx.url.protocol === 'https:' ? '; Secure' : ''}`,
      })
    }
    recordLoginFailure(ip)
    return ctx.fail(401, '管理员密码错误')
  })

  router.post('/api/login', async (ctx) => {
    try {
      const ip = ctx.remoteAddress || 'unknown'
      if (isLoginRateLimited(ip)) return loginRateLimitedResponse(ctx)
      const { password } = await ctx.bodyJson<{ password?: string }>()
      if (safeStringEqual(password, global.lx?.config?.['frontend.password'])) {
        clearLoginFailures(ip)
        loginLog.info(`Admin login success from ${ctx.remoteAddress}`)
        const sessionId = createAdminSession()
        return ctx.json({ success: true }, 200, {
          'Set-Cookie': `${ADMIN_SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${8 * 60 * 60}${ctx.url.protocol === 'https:' ? '; Secure' : ''}`,
        })
      }
      recordLoginFailure(ip)
      loginLog.warn(`Admin login failed from ${ctx.remoteAddress}`)
      return ctx.fail(401, '管理员密码错误')
    } catch {
      return ctx.fail(400, '请求格式错误，请刷新页面后重试')
    }
  })

  router.post('/api/logout', (ctx) => {
    const sessionId = ctx.cookies[ADMIN_SESSION_COOKIE_NAME]
    if (sessionId) removeAdminSession(sessionId)
    return ctx.json({ success: true }, 200, {
      'Set-Cookie': `${ADMIN_SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${ctx.url.protocol === 'https:' ? '; Secure' : ''}`,
    })
  })

  // 1.1 用户登录验证与 Session 颁发
  router.post('/api/user/verify', async (ctx) => {
    try {
      const ip = ctx.remoteAddress || 'unknown'
      if (isLoginRateLimited(ip)) return loginRateLimitedResponse(ctx)
      const { username, password } = await ctx.bodyJson<{ username?: string; password?: string }>()
      if (!username || !password) return ctx.fail(400, '请填写用户名和密码')
      const user = (global.lx?.config?.users || []).find((u: any) => u.name === username && safeStringEqual(u.password, password))
      if (user) {
        clearLoginFailures(ip)
        loginLog.info(`User login success: ${username} from ${ctx.remoteAddress}`)
        return ctx.json({ success: true })
      }
      recordLoginFailure(ip)
      loginLog.warn(`User login failed: ${username} from ${ctx.remoteAddress}`)
      return ctx.fail(401, '用户名或密码错误')
    } catch {
      return ctx.fail(400, '请求格式错误，请刷新页面后重试')
    }
  })

  router.post('/api/user/login', async (ctx) => {
    try {
      const ip = ctx.remoteAddress || 'unknown'
      if (isLoginRateLimited(ip)) return loginRateLimitedResponse(ctx)
      const { username, password } = await ctx.bodyJson<{ username?: string; password?: string }>()
      if (!username || !password) return ctx.fail(400, '请填写用户名和密码')
      const user = (global.lx?.config?.users || []).find((u: any) => u.name === username && safeStringEqual(u.password, password))
      if (user) {
        clearLoginFailures(ip)
        const token = issueUserSession(username)
        loginLog.info(`User token issued: ${username} from ${ctx.remoteAddress}`)
        return ctx.json({ success: true, token, username }, 200, {
          'Set-Cookie': `${USER_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${USER_SESSION_TTL / 1000}${ctx.url.protocol === 'https:' ? '; Secure' : ''}`,
        })
      }
      recordLoginFailure(ip)
      loginLog.warn(`User login failed: ${username} from ${ctx.remoteAddress}`)
      return ctx.fail(401, '用户名或密码错误')
    } catch {
      return ctx.fail(400, '请求格式错误，请刷新页面后重试')
    }
  })

  router.post('/api/user/logout', (ctx) => {
    const token = ctx.headers.get('x-user-token') || ctx.cookies[USER_SESSION_COOKIE_NAME]
    if (token) {
      userSessions.delete(token)
      deletePersistedUserSession(token)
    }
    return ctx.json({ success: true }, 200, {
      'Set-Cookie': `${USER_SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${ctx.url.protocol === 'https:' ? '; Secure' : ''}`,
    })
  })

  // 2. Web 播放器登录（颁发 HttpOnly Cookie Session）
  router.post('/api/music/auth', async (ctx) => {
    try {
      const ip = ctx.remoteAddress || 'unknown'
      if (isLoginRateLimited(ip)) return loginRateLimitedResponse(ctx)
      const { password } = await ctx.bodyJson<{ password?: string }>()
      const correctPassword = global.lx?.config?.['player.password'] || ''

      if (safeStringEqual(password, correctPassword)) {
        clearLoginFailures(ip)
        const sessionId = createPlayerSession()
        loginLog.info(`Player login success from ${ctx.remoteAddress}`)
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(PLAYER_SESSION_TTL / 1000)}${ctx.url.protocol === 'https:' ? '; Secure' : ''}`,
          },
        })
      }

      recordLoginFailure(ip)
      loginLog.warn(`Player login failed from ${ctx.remoteAddress}`)
      return ctx.fail(401, '播放器密码错误，请重新输入')
    } catch (err: any) {
      return ctx.fail(400, '请求格式错误，请刷新页面后重试')
    }
  })

  // 3. Web 播放器登出（清除 Cookie）
  router.post('/api/music/auth/logout', (ctx) => {
    const sessionId = ctx.cookies[SESSION_COOKIE_NAME]
    if (sessionId) removePlayerSession(sessionId)
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`,
      },
    })
  })

  // 4. Web 播放器认证状态检查
  router.get('/api/music/auth/verify', (ctx) => {
    return ctx.json({ valid: checkPlayerAuthSession(ctx.cookies) })
  })

  // 5. 用户 Token 有效性检查
  router.get('/api/user/auth/verify', (ctx) => {
    const username = verifyUserAuth(ctx)
    return ctx.json({ valid: !!username, username: username || null })
  })

  // 6. Token 配置查询与开关 (GET / POST)
  router.get('/api/user/token/config', (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.fail(401, '登录状态已失效，请重新登录')
    const config = getUserTokenConfig(username)
    return ctx.json({
      success: true,
      config: {
        enabled: config.enabled,
        tokens: config.tokens,
      },
    })
  })

  router.post('/api/user/token/config', async (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.fail(401, '登录状态已失效，请重新登录')
    try {
      const { enabled } = await ctx.bodyJson<{ enabled?: boolean }>()
      const config = getUserTokenConfig(username)
      const newEnabled = !!enabled
      if (config.enabled !== newEnabled) {
        config.enabled = newEnabled
        saveUserTokenConfig(username, config)
        tokenLog.info(`User ${username} ${newEnabled ? 'enabled' : 'disabled'} persistent token auth`)
      }
      return ctx.json({ success: true })
    } catch {
      return ctx.fail(400, '请求内容格式错误')
    }
  })

  // 7. 生成新 Token
  router.post('/api/user/token/add', async (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.fail(401, '登录状态已失效，请重新登录')
    try {
      const { name, expireDays, expiresAt } = await ctx.bodyJson<{ name?: string; expireDays?: number; expiresAt?: number | null }>()
      const config = getUserTokenConfig(username)
      if (!Array.isArray(config.tokens)) config.tokens = []
      if (config.tokens.length >= MAX_PERSISTENT_TOKENS_PER_USER) return ctx.fail(400, `Token 数量已达上限（${MAX_PERSISTENT_TOKENS_PER_USER} 个），请先删除不用的 Token`)
      const newTokenValue = `lx_tk_${crypto.randomBytes(16).toString('hex')}`
      const newToken: UserToken = {
        name: normalizeTokenName(name),
        token: newTokenValue,
        createdAt: Date.now(),
        expiresAt: parseTokenExpiry(expireDays, expiresAt),
        lastUsed: undefined,
      }
      config.tokens.push(newToken)
      saveUserTokenConfig(username, config)
      tokenLog.info(`User ${username} generated a new token: ${newToken.name}`)
      return ctx.json({ success: true, token: newTokenValue })
    } catch (e: any) {
      return ctx.fail(400, toUserMessage(e, 'Token 操作失败，请稍后重试'))
    }
  })

  // 8. 删除 Token
  router.post('/api/user/token/remove', async (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.fail(401, '登录状态已失效，请重新登录')
    try {
      const { token, tokenMasked } = await ctx.bodyJson<{ token?: string; tokenMasked?: string }>()
      const target = token || tokenMasked
      if (!target) return ctx.fail(400, '缺少要删除的 Token 标识')

      const config = getUserTokenConfig(username)
      const initialCount = config.tokens.length
      config.tokens = config.tokens.filter(t => {
        if (target.startsWith('lx_tk_')) return t.token !== target
        const m = `${t.token.slice(0, 6)}...${t.token.slice(-4)}`
        return m !== target
      })

      if (config.tokens.length !== initialCount) {
        saveUserTokenConfig(username, config)
        tokenLog.info(`User ${username} removed a token identifier: ${target.length > 20 ? target.slice(0, 10) + '...' : target}`)
        return ctx.json({ success: true })
      }
      return ctx.json({ success: false, message: 'Token not found' }, 404)
    } catch (e: any) {
      return ctx.fail(400, toUserMessage(e, 'Token 操作失败，请稍后重试'))
    }
  })

  // 9. 更新 Token (名称/过期时间)
  router.post('/api/user/token/update', async (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.fail(401, '登录状态已失效，请重新登录')
    try {
      const { tokenMasked, name, expireDays, expiresAt } = await ctx.bodyJson<{
        tokenMasked?: string
        name?: string
        expireDays?: number
        expiresAt?: number | null
      }>()
      const config = getUserTokenConfig(username)
      const tokenItem = config.tokens.find(t => {
        const masked = `${t.token.slice(0, 6)}...${t.token.slice(-4)}`
        return masked === tokenMasked
      })
      if (tokenItem) {
        if (name !== undefined) tokenItem.name = normalizeTokenName(name)
        if (expiresAt !== undefined) {
          tokenItem.expiresAt = parseTokenExpiry(undefined, expiresAt)
        } else if (expireDays !== undefined) {
          tokenItem.expiresAt = parseTokenExpiry(expireDays, undefined)
        }
        saveUserTokenConfig(username, config)
        tokenLog.info(`User ${username} updated token config: ${tokenMasked}`)
        return ctx.json({ success: true })
      }
      return ctx.fail(404, '未找到该 Token，可能已被删除')
    } catch (e: any) {
      return ctx.fail(400, toUserMessage(e, 'Token 操作失败，请稍后重试'))
    }
  })

  // 10. 切换 Token 启用状态
  router.post('/api/user/token/toggle', async (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.fail(401, '登录状态已失效，请重新登录')
    try {
      const { tokenMasked, disabled } = await ctx.bodyJson<{ tokenMasked?: string; disabled?: boolean }>()
      const config = getUserTokenConfig(username)
      const tokenItem = config.tokens.find(t => {
        const masked = `${t.token.slice(0, 6)}...${t.token.slice(-4)}`
        return masked === tokenMasked
      })
      if (tokenItem) {
        tokenItem.disabled = !!disabled
        saveUserTokenConfig(username, config)
        tokenLog.info(`User ${username} ${disabled ? 'disabled' : 'enabled'} token: ${tokenMasked}`)
        return ctx.json({ success: true })
      }
      return ctx.json({ success: false, message: 'Token not found' }, 404)
    } catch (e: any) {
      return ctx.fail(400, toUserMessage(e, 'Token 操作失败，请稍后重试'))
    }
  })

  // 11. 读取 Token 审计日志
  router.get('/api/user/token/logs', (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.fail(401, '登录状态已失效，请重新登录')
    const tokenMaskedRaw = ctx.query.get('tokenMasked')
    const tokenMasked = tokenMaskedRaw ? decodeURIComponent(tokenMaskedRaw).trim() : ''
    if (!tokenMasked) return ctx.fail(400, '缺少 Token 标识')

    try {
      // 日志目录以运行时配置为准（LOG_PATH 可被环境变量覆盖）
      const logPath = path.join(global.lx.logPath, 'token.log')
      if (!fs.existsSync(logPath)) {
        return ctx.json({ success: true, logs: [] })
      }
      const fileContent = fs.readFileSync(logPath, 'utf8')
      const lines = fileContent.split('\n')
      const targetPattern = `[${tokenMasked}]`
      const matched = lines.filter(l => l.includes(username) && l.includes(targetPattern))
      return ctx.json({ success: true, logs: matched.slice(-100) })
    } catch (err: any) {
      return ctx.fail(500, toUserMessage(err, '服务器内部错误，请稍后重试'))
    }
  })

  return router
}
