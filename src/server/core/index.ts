import type { Middleware } from './router'
import { accessLog } from '@/utils/log4js'

export * from './context'
export * from './router'

/** 全局 CORS 与跨域预检中间件 */
export const corsMiddleware: Middleware = async (ctx, next) => {
  if (ctx.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Private-Network': 'true',
      },
    })
  }

  const response = await next()
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  headers.set('Access-Control-Allow-Headers', '*')
  headers.set('Access-Control-Allow-Private-Network', 'true')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/** 访问日志中间件 */
export const accessLogMiddleware: Middleware = async (ctx, next) => {
  accessLog.info(`${ctx.method} ${ctx.pathname} from ${ctx.remoteAddress}`)
  return await next()
}

/** 将 Web 标准 Response 流式写入 Node.js http.ServerResponse */
export const dispatchWebResponse = async (res: any, webRes: Response): Promise<void> => {
  const headers: Record<string, string | string[]> = {}
  webRes.headers.forEach((val, key) => {
    const lower = key.toLowerCase()
    if (lower === 'set-cookie') {
      const existing = headers['set-cookie']
      if (existing) {
        headers['set-cookie'] = Array.isArray(existing) ? [...existing, val] : [existing, val]
      } else {
        headers['set-cookie'] = val
      }
    } else {
      headers[lower] = val
    }
  })

  res.writeHead(webRes.status, headers)

  if (webRes.body) {
    const reader = webRes.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
    } finally {
      reader.releaseLock()
    }
  }
  res.end()
}

