import { Router, adaptNodeHandler } from '../core'
import { subsonicHandler } from '../subsonic'

/** 注册 Subsonic / OpenSubsonic 协议路由 */
export const createSubsonicRouter = (): Router => {
  const router = new Router()

  // 匹配所有可能的 Subsonic 请求路径 (动态支持配置的 subsonic.path, 默认 /rest)
  router.all('/*', async (ctx) => {
    const config = (global.lx?.config ?? {}) as any
    const subsonicEnable = config['subsonic.enable'] ?? true
    if (!subsonicEnable) return null

    const configuredPath = (config['subsonic.path'] || '/rest').replace(/\/+$/, '')
    const pathname = ctx.pathname

    const isSubsonic = pathname === configuredPath ||
      pathname.startsWith(`${configuredPath}/`) ||
      pathname.startsWith('/rest/') ||
      pathname === '/rest'

    if (!isSubsonic) return null

    // 复用通用 Node 适配层：它实现了 req.on('data'/'end')，POST 到 /rest/* 的
    // 表单参数才会被解析（OpenSubsonic 的 formPost 扩展依赖这一行为）。
    return adaptNodeHandler(ctx, subsonicHandler.handleRequest.bind(subsonicHandler), ctx.url)
  })

  return router
}
