import type { Server } from 'bun'
import { createRootRouter } from './routes'
import { initMusicServices } from './services/musicService'
import {
  setupSyncServer,
  handleSocketUpgrade,
  createBunWebSocketHandlers,
  getSyncDevices,
  removeSyncDevice,
} from './sync/socketServer'
import { serverStatus, getServerStatus } from './state'
import { getAddress } from '@/utils/tools'
import { startupLog } from '@/utils/log4js'

let bunServerInstance: Server<LX.SocketData> | null = null

/**
 * 现代全栈 Bun 原生极简组装入口 (HTTP + WebSocket 统一驱动)
 */
const startHttpAndSync = async (port = 9527, bindIp = '127.0.0.1'): Promise<void> => {
  const rootRouter = createRootRouter()
  const hostUrl = `http://${bindIp.includes(':') ? `[${bindIp}]` : bindIp}:${port}`
  setupSyncServer(hostUrl)

  bunServerInstance = Bun.serve<LX.SocketData>({
    port,
    hostname: bindIp,
    maxRequestBodySize: 1024 * 1024 * 100, // 100MB 支持大文件与源文件上传
    async fetch(req, server) {
      // 1. WebSocket 连接升级与鉴权拦截
      if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        const upgradeRes = await handleSocketUpgrade(req, server)
        if (upgradeRes) return upgradeRes
      }

      // 2. Web 标准 HTTP 路由分发
      const remoteAddress = server.requestIP(req)?.address || '127.0.0.1'
      const webRes = await rootRouter.handle(req, { remoteAddress })
      if (webRes instanceof Response) return webRes

      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    },
    websocket: createBunWebSocketHandlers(),
  })

  startupLog.info(`Listening on ${bindIp} port ${bunServerInstance.port}`)
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
