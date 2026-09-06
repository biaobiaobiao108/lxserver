import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import { Router, type HttpContext } from '../core'
import {
  verifyAdminAuth,
  checkPlayerAuthSession,
  createPlayerSession,
  removePlayerSession,
  SESSION_COOKIE_NAME,
} from '../auth'
import { File } from '@/constants'
import { getUserDirname } from '@/user'
import { tokenLog, loginLog } from '@/utils/log4js'

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
const PLAYER_SESSION_TTL = 24 * 60 * 60 * 1000 // 24小时

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
    const userDirname = getUserDirname(username)
    const userPath = path.join(global.lx.userPath, userDirname)
    const tokenPath = path.join(userPath, File.userTokensJSON)
    if (!fs.existsSync(userPath)) fs.mkdirSync(userPath, { recursive: true })
    fs.writeFile(tokenPath, JSON.stringify(config, null, 2), 'utf8', (err) => {
      if (err) console.error('[Token] 写盘失败:', err)
    })
  }, 10_000)
  persistentTokenSaveQueue.set(username, timer)
}

export const getUserTokenConfig = (username: string): UserTokenConfig => {
  const userDirname = getUserDirname(username)
  const userPath = path.join(global.lx.userPath, userDirname)
  const tokenPath = path.join(userPath, File.userTokensJSON)

  if (fs.existsSync(tokenPath)) {
    try {
      return JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
    } catch {
      return { enabled: false, tokens: [] }
    }
  }
  return { enabled: false, tokens: [] }
}

export const saveUserTokenConfig = (username: string, config: UserTokenConfig) => {
  const userDirname = getUserDirname(username)
  const userPath = path.join(global.lx.userPath, userDirname)
  const tokenPath = path.join(userPath, File.userTokensJSON)
  if (!fs.existsSync(userPath)) fs.mkdirSync(userPath, { recursive: true })
  fs.writeFileSync(tokenPath, JSON.stringify(config, null, 2), 'utf8')

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
  let token: string | null = null
  let ip = '127.0.0.1'
  let url = ''

  if ('cookies' in req && 'remoteAddress' in req) {
    // HttpContext
    token = req.headers.get('x-user-token')
    ip = req.remoteAddress
    url = req.pathname
  } else if ('headers' in req && typeof (req.headers as any).get === 'function') {
    // Web Request
    token = (req.headers as Headers).get('x-user-token')
    url = (req as Request).url
  } else if ('headers' in req) {
    // IncomingMessage
    token = (req.headers as any)['x-user-token']
    url = (req as any).url || ''
  }

  if (token) {
    // 1. Session Token 验证
    const session = userSessions.get(token)
    if (session && Date.now() - session.createdAt <= USER_SESSION_TTL) {
      return session.username
    }

    // 2. 持久化 API Token 验证
    const persistentUsername = persistentTokens.get(token)
    if (persistentUsername) {
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

/** 注册统一鉴权与 Token 管理路由 */
export const createAuthRouter = (): Router => {
  const router = new Router()

  // 1. 管理后台密码校验
  router.post('/api/admin/verify', (ctx) => {
    if (verifyAdminAuth(ctx.request)) {
      return ctx.json({ success: true })
    }
    return ctx.json({ success: false, error: '管理员密码验证失败' }, 401)
  })

  // 2. Web 播放器登录（颁发 HttpOnly Cookie Session）
  router.post('/api/music/auth', async (ctx) => {
    try {
      const { password } = await ctx.bodyJson<{ password?: string }>()
      const correctPassword = global.lx?.config?.['player.password'] || ''

      if (password === correctPassword) {
        const sessionId = createPlayerSession()
        loginLog.info(`Player login success from ${ctx.remoteAddress}`)
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${PLAYER_SESSION_TTL / 1000}`,
          },
        })
      }

      loginLog.warn(`Player login failed from ${ctx.remoteAddress}`)
      return ctx.json({ success: false })
    } catch (err: any) {
      return ctx.json({ success: false, error: err.message }, 500)
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
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
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
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
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
      return ctx.text('Invalid Body', 400)
    }
  })

  // 7. 生成新 Token
  router.post('/api/user/token/add', async (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    try {
      const { name, expireDays, expiresAt } = await ctx.bodyJson<{ name?: string; expireDays?: number; expiresAt?: number | null }>()
      const config = getUserTokenConfig(username)
      const newTokenValue = `lx_tk_${crypto.randomBytes(16).toString('hex')}`
      const newToken: UserToken = {
        name: name || '未命名 Token',
        token: newTokenValue,
        createdAt: Date.now(),
        expiresAt: (expiresAt !== undefined && expiresAt !== null) ? expiresAt : (expireDays ? Date.now() + (expireDays * 24 * 60 * 60 * 1000) : null),
        lastUsed: undefined,
      }
      config.tokens.push(newToken)
      saveUserTokenConfig(username, config)
      tokenLog.info(`User ${username} generated a new token: ${name}`)
      return ctx.json({ success: true, token: newTokenValue })
    } catch (e: any) {
      return ctx.text(e.message, 400)
    }
  })

  // 8. 删除 Token
  router.post('/api/user/token/remove', async (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    try {
      const { token, tokenMasked } = await ctx.bodyJson<{ token?: string; tokenMasked?: string }>()
      const target = token || tokenMasked
      if (!target) return ctx.text('Missing token identifier', 400)

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
      return ctx.text(e.message, 400)
    }
  })

  // 9. 更新 Token (名称/过期时间)
  router.post('/api/user/token/update', async (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
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
        if (name !== undefined) tokenItem.name = name
        if (expiresAt !== undefined) {
          tokenItem.expiresAt = expiresAt
        } else if (expireDays !== undefined) {
          tokenItem.expiresAt = expireDays ? Date.now() + (expireDays * 24 * 60 * 60 * 1000) : null
        }
        saveUserTokenConfig(username, config)
        tokenLog.info(`User ${username} updated token config: ${tokenMasked}`)
        return ctx.json({ success: true })
      }
      return ctx.text('Token not found', 404)
    } catch (e: any) {
      return ctx.text(e.message, 400)
    }
  })

  // 10. 切换 Token 启用状态
  router.post('/api/user/token/toggle', async (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
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
      return ctx.text(e.message, 400)
    }
  })

  // 11. 读取 Token 审计日志
  router.get('/api/user/token/logs', (ctx) => {
    const username = verifyUserAuth(ctx)
    if (!username) return ctx.json({ success: false, message: 'Unauthorized' }, 401)
    const tokenMaskedRaw = ctx.query.get('tokenMasked')
    const tokenMasked = tokenMaskedRaw ? decodeURIComponent(tokenMaskedRaw).trim() : ''
    if (!tokenMasked) return ctx.text('Missing tokenMasked', 400)

    try {
      const logPath = path.join(process.cwd(), 'logs', 'token.log')
      if (!fs.existsSync(logPath)) {
        return ctx.json({ success: true, logs: [] })
      }
      const fileContent = fs.readFileSync(logPath, 'utf8')
      const lines = fileContent.split('\n')
      const targetPattern = `[${tokenMasked}]`
      const matched = lines.filter(l => l.includes(username) && l.includes(targetPattern))
      return ctx.json({ success: true, logs: matched.slice(-100) })
    } catch (err: any) {
      return ctx.json({ success: false, error: err.message }, 500)
    }
  })

  return router
}
