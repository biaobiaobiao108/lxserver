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
        'Access-Control-Allow-Headers': 'Content-Type, X-Frontend-Auth, X-User-Name, X-User-Token',
      },
    })
  }

  const response = await next()
  if (!response || !(response instanceof Response)) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Frontend-Auth, X-User-Name, X-User-Token')

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

/** 将旧版 IncomingMessage/ServerResponse 处理器适配为现代 Web Response */
export const adaptNodeHandler = (
  ctx: any,
  handler: (req: any, res: any, ...args: any[]) => any,
  ...extraArgs: any[]
): Promise<Response> => {
  return new Promise((resolve) => {
    let settled = false
    let responseStatus = 200
    const responseHeaders: Record<string, string> = {}
    let responseBody = ''
    const binaryChunks: Buffer[] = []
    let isBinary = false
    const maxBodyBytes = 10 * 1024 * 1024
    let bodyPromise: Promise<Buffer> | null = null
    const errorListeners: Array<(error: Error) => void> = []
    const readRequestBody = (): Promise<Buffer> => {
      if (bodyPromise) return bodyPromise
      const contentLength = Number(ctx.headers.get('content-length') || 0)
      if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
        bodyPromise = Promise.reject(new Error('Request body is too large'))
        return bodyPromise
      }

      bodyPromise = (async () => {
        if (!ctx.request.body) return Buffer.alloc(0)
        const reader = ctx.request.body.getReader()
        const chunks: Buffer[] = []
        let total = 0
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > maxBodyBytes) {
              await reader.cancel()
              throw new Error('Request body is too large')
            }
            chunks.push(Buffer.from(value))
          }
          return Buffer.concat(chunks, total)
        } finally {
          reader.releaseLock()
        }
      })()
      bodyPromise.catch(error => errorListeners.forEach(listener => listener(error)))
      return bodyPromise
    }

    const mockReq: any = {
      method: ctx.method,
      url: ctx.request.url,
      headers: Object.fromEntries(ctx.headers.entries()),
      socket: { remoteAddress: ctx.remoteAddress },
      on(event: string, callback: (arg?: any) => void) {
        if (event === 'data') {
          void readRequestBody().then(callback).catch(() => { })
        } else if (event === 'end') {
          void readRequestBody().then(() => setTimeout(() => callback(), 5)).catch(() => { })
        } else if (event === 'error') {
          errorListeners.push(callback as (error: Error) => void)
        }
        return mockReq
      },
    }

    const mockRes: any = {
      writeHead(status: number, headers?: any) {
        responseStatus = status
        if (headers) Object.assign(responseHeaders, headers)
      },
      setHeader(k: string, v: string) {
        responseHeaders[k.toLowerCase()] = v
      },
      write(chunk: any) {
        if (Buffer.isBuffer(chunk)) {
          isBinary = true
          binaryChunks.push(chunk)
        } else {
          responseBody += chunk
        }
      },
      end(data?: any) {
        if (settled) return
        settled = true
        if (data) {
          if (Buffer.isBuffer(data)) {
            isBinary = true
            binaryChunks.push(data)
          } else {
            responseBody += data
          }
        }
        if (isBinary) {
          resolve(new Response(new Uint8Array(Buffer.concat(binaryChunks)), {
            status: responseStatus,
            headers: responseHeaders,
          }))
        } else {
          resolve(new Response(responseBody, {
            status: responseStatus,
            headers: responseHeaders,
          }))
        }
      },
    }

    try {
      Promise.resolve(handler(mockReq, mockRes, ...extraArgs)).catch((e: any) => {
        if (!settled) {
          settled = true
          resolve(ctx.json({ success: false, error: e?.message || 'Internal error' }, 500))
        }
      })
    } catch (e: any) {
      if (!settled) {
        settled = true
        resolve(ctx.json({ success: false, error: e.message }, 500))
      }
    }
  })
}
