import http from 'node:http'
import { createRootRouter } from './routes'
import { dispatchWebResponse } from './core'
import { initMusicServices } from './services/musicService'
import { setupSyncServer, getSyncDevices, removeSyncDevice } from './sync/socketServer'
import { serverStatus, getServerStatus } from './state'
import { getAddress, getIP } from '@/utils/tools'
import { startupLog } from '@/utils/log4js'

/**
 * 现代全栈 Bun 服务端极简组装入口
 */
const startHttpAndSync = async (port = 9527, bindIp = '127.0.0.1'): Promise<void> => {
  const rootRouter = createRootRouter()

  return new Promise((resolve, reject) => {
    const httpServer = http.createServer(async (req, res) => {
      try {
        const host = req.headers.host || `${bindIp}:${port}`
        const webHeaders = new Headers()
        for (const [k, v] of Object.entries(req.headers)) {
          if (Array.isArray(v)) v.forEach(val => webHeaders.append(k, val))
          else if (v !== undefined) webHeaders.set(k, v)
        }

        let webBody: ReadableStream | null = null
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
          webBody = new ReadableStream({
            start(c) {
              req.on('data', chunk => c.enqueue(chunk))
              req.on('end', () => c.close())
              req.on('error', err => c.error(err))
            },
          })
        }

        const webReq = new Request(`http://${host}${req.url}`, {
          method: req.method,
          headers: webHeaders,
          body: webBody,
          // @ts-ignore
          duplex: 'half',
        })

        const webRes = await rootRouter.handle(webReq, { remoteAddress: getIP(req) })
        if (webRes instanceof Response) {
          await dispatchWebResponse(res, webRes)
          return
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not Found')
      } catch (err: any) {
        console.error('[HttpServer Error]:', err)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end(err?.message || 'Server Internal Error')
        }
      }
    })

    httpServer.on('error', (err) => {
      console.error('[HttpServer Fatal]:', err)
      reject(err)
    })

    httpServer.on('listening', () => {
      const addr = httpServer.address()
      const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr?.port}`
      startupLog.info(`Listening on ${bindIp} ${bind}`)

      const hostUrl = `http://${bindIp.includes(':') ? `[${bindIp}]` : bindIp}:${port}`
      setupSyncServer(httpServer, hostUrl)
      resolve()
    })

    httpServer.listen(port, bindIp)
  })
}

export const startServer = async (port: number, ip: string): Promise<void> => {
  startupLog.info(`Starting lxserver in ${process.env.NODE_ENV === 'production' ? 'production' : 'development'}`)
  await initMusicServices()
  try {
    await startHttpAndSync(port, ip)
    serverStatus.status = true
    serverStatus.message = ''
    serverStatus.address = ip === '0.0.0.0' ? getAddress() : [ip]
  } catch (err: any) {
    console.error('[StartServer Fatal]:', err)
    serverStatus.status = false
    serverStatus.message = err.message
    serverStatus.address = []
  }
}

export const getStatus = (): LX.Sync.Status => getServerStatus()
export const getDevices = (name: string) => getSyncDevices(name)
export const removeDevice = (name: string, clientId: string) => removeSyncDevice(name, clientId)
