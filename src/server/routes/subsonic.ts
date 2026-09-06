import { Router } from '../core'
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

    // 适配 Node.js 风格参数以便兼容已有 2600 行稳定运行的 SubsonicHandler
    return new Promise<Response>((resolve) => {
      let responseBody = ''
      let responseStatus = 200
      const responseHeaders: Record<string, string> = {}
      let isBinary = false
      let binaryBuffer: Buffer | null = null

      const mockReq: any = {
        method: ctx.method,
        url: ctx.request.url,
        headers: Object.fromEntries(ctx.headers.entries()),
      }

      const mockRes: any = {
        writeHead(status: number, headers?: Record<string, string>) {
          responseStatus = status
          if (headers) {
            Object.assign(responseHeaders, headers)
          }
        },
        setHeader(key: string, value: string) {
          responseHeaders[key.toLowerCase()] = value
        },
        write(chunk: any) {
          if (Buffer.isBuffer(chunk)) {
            isBinary = true
            binaryBuffer = binaryBuffer ? Buffer.concat([binaryBuffer, chunk]) : chunk
          } else {
            responseBody += chunk
          }
        },
        end(data?: any) {
          if (data) {
            if (Buffer.isBuffer(data)) {
              isBinary = true
              binaryBuffer = binaryBuffer ? Buffer.concat([binaryBuffer, data]) : data
            } else {
              responseBody += data
            }
          }
          if (isBinary && binaryBuffer) {
            resolve(new Response(new Uint8Array(binaryBuffer), {
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
        Promise.resolve(subsonicHandler.handleRequest(mockReq, mockRes, ctx.url)).catch((err: any) => {
          resolve(ctx.json({ error: err?.message || 'Internal error' }, 500))
        })
      } catch (err: any) {
        resolve(ctx.json({ error: { code: 500, message: err.message } }, 500))
      }
    })
  })

  return router
}
