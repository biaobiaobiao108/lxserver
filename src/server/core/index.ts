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

/** 值得压缩的响应类型（文本类） */
const COMPRESSIBLE_TYPE = /^(?:text\/|application\/(?:json|javascript|xml|xhtml\+xml|manifest\+json)|image\/svg\+xml)/i
const COMPRESS_MIN_BYTES = 1024
/** 已压缩结果缓存上限：key 为 ETag + 编码，用于避免重复压缩同一静态资源 */
const COMPRESS_CACHE_MAX_ENTRIES = 32
const COMPRESS_CACHE_MAX_BYTES = 32 * 1024 * 1024
const compressedCache = new Map<string, Uint8Array>()
let compressedCacheBytes = 0

/** Uint8Array 在运行时可作为 BodyInit，但 TS 的类型定义要求显式转换 */
const asBody = (data: Uint8Array): BodyInit => data as unknown as BodyInit

const readCompressedCache = (key: string): Uint8Array | null => {
  const hit = compressedCache.get(key)
  if (!hit) return null
  // LRU：命中后重新插入，保证热点资源留在缓存里
  compressedCache.delete(key)
  compressedCache.set(key, hit)
  return hit
}

const writeCompressedCache = (key: string, value: Uint8Array): void => {
  compressedCache.set(key, value)
  compressedCacheBytes += value.byteLength
  while (compressedCache.size > COMPRESS_CACHE_MAX_ENTRIES || compressedCacheBytes > COMPRESS_CACHE_MAX_BYTES) {
    const oldest = compressedCache.keys().next().value
    if (oldest === undefined) break
    compressedCacheBytes -= compressedCache.get(oldest)?.byteLength ?? 0
    compressedCache.delete(oldest)
  }
}

const withVary = (headers: Headers, value: string): void => {
  const current = headers.get('vary')
  if (!current) headers.set('vary', value)
  else if (!current.split(',').map(item => item.trim().toLowerCase()).includes(value.toLowerCase())) {
    headers.set('vary', `${current}, ${value}`)
  }
}

/**
 * 响应压缩中间件：客户端声明支持 gzip 时，对文本类响应启用 gzip。
 * 静态资源带稳定 ETag，压缩结果按 ETag 缓存，避免每次请求重复压缩。
 */
export const compressionMiddleware: Middleware = async (ctx, next) => {
  const response = await next()
  if (!(response instanceof Response)) return response
  if (ctx.method === 'HEAD' || response.status === 204 || response.status === 206 || response.status === 304) return response
  if (!ctx.headers.get('accept-encoding')?.toLowerCase().includes('gzip')) return response
  if (response.headers.get('content-encoding') || ctx.headers.get('range')) return response

  const contentType = response.headers.get('content-type') || ''
  if (!COMPRESSIBLE_TYPE.test(contentType)) return response

  const etag = response.headers.get('etag')
  const cacheKey = etag ? `${etag}|gzip` : ''
  if (cacheKey) {
    const cached = readCompressedCache(cacheKey)
    if (cached) {
      const headers = new Headers(response.headers)
      headers.set('content-encoding', 'gzip')
      headers.set('content-length', String(cached.byteLength))
      withVary(headers, 'Accept-Encoding')
      return new Response(asBody(cached), { status: response.status, statusText: response.statusText, headers })
    }
  }

  const body = new Uint8Array(await response.arrayBuffer())
  const headerForRebuild = new Headers(response.headers)
  withVary(headerForRebuild, 'Accept-Encoding')
  if (body.byteLength < COMPRESS_MIN_BYTES) {
    return new Response(asBody(body), { status: response.status, statusText: response.statusText, headers: headerForRebuild })
  }

  const compressed = Bun.gzipSync(body)
  if (compressed.byteLength >= body.byteLength) {
    return new Response(asBody(body), { status: response.status, statusText: response.statusText, headers: headerForRebuild })
  }
  if (cacheKey) writeCompressedCache(cacheKey, compressed)

  headerForRebuild.set('content-encoding', 'gzip')
  headerForRebuild.set('content-length', String(compressed.byteLength))
  return new Response(asBody(compressed), { status: response.status, statusText: response.statusText, headers: headerForRebuild })
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
        resolve(ctx.fail(500, '服务器内部错误，请稍后重试'))
      }
    }
  })
}
