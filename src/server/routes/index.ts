import { Router, corsMiddleware, accessLogMiddleware } from '../core'
import { createStaticRouter } from './static'
import { createAuthRouter } from './auth'
import { createSystemRouter } from './system'
import { createUserRouter } from './user'
import { createCustomSourceRouter } from './customSource'
import { createSubsonicRouter } from './subsonic'

/**
 * 组装所有业务领域子路由，生成顶级全局路由器
 */
export const createRootRouter = (): Router => {
  const root = new Router()

  // 全局中间件
  root.use(corsMiddleware)
  root.use(accessLogMiddleware)

  // 1. 业务领域路由挂载
  root.mount('/', createAuthRouter())
  root.mount('/', createSystemRouter())
  root.mount('/', createUserRouter())
  root.mount('/', createCustomSourceRouter())
  root.mount('/', createSubsonicRouter())

  // 2. 静态资源与前端托管（必须挂在最后，作为兜底匹配）
  root.mount('/', createStaticRouter())

  return root
}
