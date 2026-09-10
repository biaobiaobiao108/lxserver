import { Router, corsMiddleware, accessLogMiddleware, compressionMiddleware, type Middleware } from '../core'
import { verifyAdminAuth, checkPlayerAuthSession } from '../auth'
import { createAuthRouter } from './auth'
import { createSystemRouter } from './system'
import { createUserRouter } from './user'
import { createCustomSourceRouter } from './customSource'
import { createMusicRouter } from './music'
import { createCacheRouter } from './cache'
import { createSyncRouter } from './sync'
import { createSubsonicRouter } from './subsonic'
import { createStaticRouter } from './static'

/** 播放器鉴权豁免：登录态自身的接口必须在未登录时也可访问 */
const PLAYER_AUTH_EXEMPT_PATHS = new Set([
  '/api/music/config',
  '/api/music/auth',
  '/api/music/auth/verify',
  '/api/music/auth/logout',
])

/**
 * 播放器访问密码保护中间件。
 * 仅开启 player.enableAuth 时生效，覆盖整个 /api/music/* 数据接口，
 * 避免出现「页面被密码挡住、接口仍可匿名调用」的情况。
 * 管理员凭据（X-Frontend-Auth / 管理会话）始终放行。
 */
const playerApiAuthMiddleware: Middleware = async (ctx, next) => {
  if (!global.lx?.config?.['player.enableAuth']) return next()
  if (PLAYER_AUTH_EXEMPT_PATHS.has(ctx.pathname)) return next()
  if (checkPlayerAuthSession(ctx.cookies)) return next()
  if (verifyAdminAuth(ctx.request)) return next()
  return ctx.fail(401, '播放器登录状态已失效，请重新登录')
}

/**
 * 组装所有业务领域子路由，生成顶级全局路由器
 */
export const createRootRouter = (): Router => {
  const root = new Router()

  // 全局中间件
  root.use(corsMiddleware)
  root.use(accessLogMiddleware)
  root.use(compressionMiddleware)

  // 1. 业务领域路由挂载
  root.mount('/', createAuthRouter())
  root.mount('/', createSystemRouter())
  root.mount('/', createUserRouter())
  root.mount('/', createCustomSourceRouter())
  root.mount('/', createMusicRouter())
  root.mount('/', createCacheRouter())
  root.mount('/', createSyncRouter())
  root.mount('/', createSubsonicRouter())

  // 2. 播放器数据接口鉴权（仅作用于 /api/music/*，不影响 Subsonic 与同步协议）
  root.use('/api/music', playerApiAuthMiddleware)

  // 3. 静态资源与前端托管（必须挂在最后，作为兜底匹配）
  root.mount('/', createStaticRouter())

  return root
}
