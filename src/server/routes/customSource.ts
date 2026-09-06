import { Router, adaptNodeHandler, type HttpContext } from '../core'
import { verifyAdminAuth } from '../auth'
import { verifyUserAuth } from './auth'
import * as customSourceHandlers from '../customSourceHandlers'

/** 注册自定义音源管理路由 */
export const createCustomSourceRouter = (): Router => {
  const router = new Router()

  // 1. 源脚本校验 (无需登录)
  router.post('/api/custom-source/validate', (ctx) => {
    return adaptNodeHandler(ctx, customSourceHandlers.handleValidate)
  })

  // 通用中间件：若启用了公开受限模式，管理操作必须登录或管理员鉴权
  router.use('/api/custom-source/*', async (ctx, next) => {
    if (ctx.pathname === '/api/custom-source/validate') return await next()
    const config = (global.lx?.config ?? {}) as any
    if (config['user.enablePublicRestriction']) {
      const isAdmin = verifyAdminAuth(ctx.request)
      const user = verifyUserAuth(ctx)
      if (!isAdmin && !user) {
        return ctx.json({ success: false, error: '当前系统已开启访问限制，管理操作请登录后重试。' }, 403)
      }
    }
    return await next()
  })

  // 2. 导入与上传
  router.post('/api/custom-source/import', (ctx) => {
    return adaptNodeHandler(ctx, customSourceHandlers.handleImport)
  })

  router.post('/api/custom-source/upload', (ctx) => {
    return adaptNodeHandler(ctx, customSourceHandlers.handleUpload)
  })

  // 3. 列表查询
  router.get('/api/custom-source/list', (ctx) => {
    const username = ctx.query.get('username') || 'default'
    return adaptNodeHandler(ctx, customSourceHandlers.handleList, username)
  })

  // 4. 启用/禁用切换
  router.post('/api/custom-source/toggle', (ctx) => {
    return adaptNodeHandler(ctx, customSourceHandlers.handleToggle)
  })

  // 5. 删除
  router.post('/api/custom-source/delete', (ctx) => {
    return adaptNodeHandler(ctx, customSourceHandlers.handleDelete)
  })

  // 6. 重排序
  router.post('/api/custom-source/reorder', (ctx) => {
    return adaptNodeHandler(ctx, customSourceHandlers.handleReorder)
  })

  return router
}
