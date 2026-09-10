import { Router, adaptNodeHandler, type HttpContext } from '../core'
import { authCode } from '../auth'
import { getServerId } from '@/user'
import { SYNC_CODE } from '@/constants'

/**
 * 注册 LX Music 客户端同步握手路由 (/hello, /id, /ah 以及 /<username>/...)
 */
export const createSyncRouter = (): Router => {
  const router = new Router()

  // 匹配所有以 /hello, /id, /ah 结尾的请求，包括根路径和带用户名路径
  router.all('/*', async (ctx) => {
    const pathname = ctx.pathname
    const endUrl = `/${pathname.split('/').filter(Boolean).at(-1) ?? ''}`

    if (endUrl !== '/hello' && endUrl !== '/id' && endUrl !== '/ah') {
      return null
    }

    const config = (global.lx?.config ?? {}) as any

    switch (endUrl) {
      case '/hello': {
        if (!config['user.enableRoot']) {
          const parts = pathname.split('/').filter(Boolean)
          if (parts.length <= 1) {
            return ctx.fail(403, '根路径访问已关闭，请使用 /<用户名>/ah 连接')
          }
        }
        return ctx.text(SYNC_CODE.helloMsg, 200)
      }

      case '/id': {
        if (!config['user.enableRoot']) {
          const parts = pathname.split('/').filter(Boolean)
          if (parts.length <= 1) {
            return ctx.fail(403, '根路径访问已关闭，请使用 /<用户名>/ah 连接')
          }
        }
        return ctx.text(SYNC_CODE.idPrefix + getServerId(), 200)
      }

      case '/ah': {
        let targetUserName: string | undefined

        // 1. 尝试匹配用户路径 /<userName>/ah
        if (config['user.enablePath']) {
          const parts = pathname.split('/').filter(Boolean)
          if (parts.length > 1 && parts[parts.length - 1] === 'ah') {
            targetUserName = decodeURIComponent(parts[parts.length - 2])
          }
        }

        // 2. 如果没有匹配到用户名
        if (!targetUserName) {
          if (!config['user.enableRoot']) {
            return ctx.fail(403, '根路径访问已关闭，请使用 /<用户名>/ah 连接')
          }
        }

        return adaptNodeHandler(ctx, authCode, config.users, targetUserName)
      }

      default:
        return null
    }
  })

  return router
}
