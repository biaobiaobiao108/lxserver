import type { ServerWebSocket, Server } from 'bun'
import { registerLocalSyncEvent, callObj, sync } from './index'
import { authConnect } from '../auth'
import { getAddress, sendStatus, decryptMsg, encryptMsg } from '@/utils/tools'
import { accessLog, syncLog } from '@/utils/log4js'
import { SYNC_CODE, SYNC_CLOSE_CODE } from '@/constants'
import { getUserSpace, releaseUserSpace, getUserName } from '@/user'
import { createMsg2call } from 'message2call'
import { serverStatus } from '../state'

let socketServerInstance: LX.SocketServer | null = null
let currentHost = 'http://localhost'
let heartbeatInterval: Timer | null = null
const MAX_SYNC_MESSAGE_BYTES = 20 * 1024 * 1024

function noop() {}

const checkDuplicateClient = (newSocket: LX.Socket) => {
  if (!socketServerInstance) return
  for (const client of [...socketServerInstance.clients]) {
    if (client === newSocket || client.keyInfo?.clientId !== newSocket.keyInfo?.clientId) continue
    syncLog.info('duplicate client', client.userInfo?.name, client.keyInfo?.deviceName)
    client.isReady = false
    for (const name of Object.keys(client.moduleReadys) as Array<keyof LX.Socket['moduleReadys']>) {
      client.moduleReadys[name] = false
    }
    client.close(SYNC_CLOSE_CODE.normal)
  }
}

const handleConnection = async (socket: LX.Socket, reqUrl: string) => {
  const queryData = new URL(reqUrl, currentHost).searchParams
  const clientId = queryData.get('i')
  if (!clientId) {
    socket.close(SYNC_CLOSE_CODE.failed)
    return
  }

  const userName = getUserName(clientId)
  if (!userName) {
    socket.close(SYNC_CLOSE_CODE.failed)
    return
  }
  const userSpace = getUserSpace(userName)
  const keyInfo = userSpace.dataManage.getClientKeyInfo(clientId)
  if (!keyInfo) {
    socket.close(SYNC_CLOSE_CODE.failed)
    return
  }
  const user = (global.lx?.config?.users || []).find((u: any) => u.name === userName)
  if (!user) {
    socket.close(SYNC_CLOSE_CODE.failed)
    return
  }
  keyInfo.lastConnectDate = Date.now()
  userSpace.dataManage.saveClientKeyInfo(keyInfo)
  socket.keyInfo = keyInfo
  socket.userInfo = user

  checkDuplicateClient(socket)

  try {
    await sync(socket)
  } catch (err: any) {
    syncLog.warn(err)
    socket.close(SYNC_CLOSE_CODE.failed)
    return
  }

  serverStatus.devices.push(keyInfo)
  sendStatus(serverStatus)
  socket.onClose(() => {
    serverStatus.devices.splice(serverStatus.devices.findIndex((k: any) => k.clientId === keyInfo.clientId), 1)
    sendStatus(serverStatus)
  })

  accessLog.info('connection', user.name, keyInfo.deviceName)
  socket.isReady = true
}

const handleUnconnection = (userName: string) => {
  releaseUserSpace(userName)
}

/** 拦截并鉴权 WebSocket Upgrade 请求 */
export const handleSocketUpgrade = async (
  req: Request,
  server: Server<LX.SocketData>
): Promise<Response | null> => {
  const remoteAddress = server.requestIP(req)?.address || '127.0.0.1'
  const url = new URL(req.url)
  const clientId = url.searchParams.get('i') || ''
  const userName = getUserName(clientId) || ''

  try {
    await authConnect(req, remoteAddress)
  } catch {
    return new Response('HTTP/1.1 401 Unauthorized', { status: 401 })
  }

  const socketData: LX.SocketData = {
    reqUrl: req.url,
    clientId,
    userName,
    remoteAddress,
  }

  const upgraded = server.upgrade(req, { data: socketData })
  if (upgraded) {
    return new Response(null)
  }
  return new Response('WebSocket upgrade failed', { status: 400 })
}

/** 存储原生 ws 到 LX.Socket 适配代理的映射 */
const socketMap = new WeakMap<ServerWebSocket<LX.SocketData>, LX.Socket>()
const activeClients = new Set<LX.Socket>()

export const disconnectSyncClientsForRestore = (): void => {
  for (const client of activeClients) {
    client.isReady = false
    client.moduleReadys.list = false
    client.moduleReadys.dislike = false
    client.terminate?.()
  }
}

/** 创建或获取 LX.Socket 适配代理 */
const getOrCreateSocketAdapter = (ws: ServerWebSocket<LX.SocketData>): LX.Socket => {
  let adapter = socketMap.get(ws)
  if (adapter) return adapter

  let closeEvents: Array<(err: Error) => (void | Promise<void>)> = []
  let messageListeners: Array<(event: { data: any }) => void> = []
  let disconnected = false

  const socket: Partial<LX.Socket> = {
    isAlive: true,
    isReady: false,
    keyInfo: null as any,
    userInfo: null as any,
    feature: {
      list: false,
      dislike: false,
    },
    moduleReadys: {
      list: false,
      dislike: false,
    },
    get readyState() {
      return ws.readyState
    },
    send(data: any) {
      if (ws.readyState === 1) {
        ws.send(data)
      }
    },
    close(code?: number, reason?: string) {
      try {
        ws.close(code, reason)
      } catch { }
    },
    ping(data?: any) {
      try {
        ws.ping(data)
      } catch { }
    },
    terminate() {
      try {
        ws.terminate()
      } catch { }
    },
    addEventListener(type: string, listener: (...args: any[]) => void) {
      if (type === 'message') {
        messageListeners.push(listener)
      } else if (type === 'close') {
        closeEvents.push(listener)
      }
    },
    removeEventListener(type: string, listener: (...args: any[]) => void) {
      if (type === 'message') {
        messageListeners = messageListeners.filter(l => l !== listener)
      } else if (type === 'close') {
        closeEvents = closeEvents.filter(l => l !== listener)
      }
    },
    onClose(handler: (err: Error) => (void | Promise<void>)) {
      closeEvents.push(handler)
      return () => {
        closeEvents = closeEvents.filter(h => h !== handler)
      }
    },
    broadcast(handler: (client: LX.Socket) => void) {
      if (!socketServerInstance) return
      for (const client of socketServerInstance.clients) {
        handler(client)
      }
    },
  }

  const lxSocket = socket as LX.Socket
  socketMap.set(ws, lxSocket)

  // 绑定 message2call
  const msg2call = createMsg2call<LX.Sync.ClientSyncActions>({
    funcsObj: callObj,
    timeout: 120 * 1000,
    sendMessage(data: any) {
      if (disconnected) throw new Error('disconnected')
      void encryptMsg(lxSocket.keyInfo, JSON.stringify(data)).then((encryptedData: string) => {
        lxSocket.send(encryptedData)
      }).catch(err => {
        syncLog.error('encrypt message error:', err)
        lxSocket.close(SYNC_CLOSE_CODE.failed)
      })
    },
    onCallBeforeParams(rawArgs: any[]) {
      return [lxSocket, ...rawArgs]
    },
    onError(error: Error, path: string[], groupName: string | null) {
      const name = groupName ?? ''
      const userName = lxSocket.userInfo?.name ?? ''
      const deviceName = lxSocket.keyInfo?.deviceName ?? ''
      syncLog.error(`sync call ${userName} ${deviceName} ${name} ${path.join('.')} error:`, error)
    },
  })

  lxSocket.remote = msg2call.remote
  lxSocket.remoteQueueList = msg2call.createQueueRemote('list')
  lxSocket.remoteQueueDislike = msg2call.createQueueRemote('dislike')

  lxSocket.addEventListener('message', ({ data }: any) => {
    if (typeof data !== 'string') return
    void decryptMsg(lxSocket.keyInfo, data).then((decryptedData) => {
      let syncData: any
      try {
        syncData = JSON.parse(decryptedData)
      } catch (err) {
        syncLog.error('parse message error:', err)
        lxSocket.close(SYNC_CLOSE_CODE.failed)
        return
      }
      msg2call.message(syncData)
    }).catch(err => {
      syncLog.error('decrypt message error:', err)
      lxSocket.close(SYNC_CLOSE_CODE.failed)
    })
  })

  // 挂载内部触发器供 Bun websocket handler 调度
  ;(ws as any).__dispatchMessage = (data: any) => {
    for (const listener of messageListeners) {
      try {
        listener({ data })
      } catch (err) {
        console.error('[WS dispatchMessage Error]:', err)
      }
    }
  }

  ;(ws as any).__dispatchClose = () => {
    const err = new Error('closed')
    for (const handler of closeEvents) {
      try {
        void handler(err)
      } catch (err: any) {
        syncLog.error(err?.message)
      }
    }
    closeEvents = []
    messageListeners = []
    disconnected = true
    msg2call.destroy()
    activeClients.delete(lxSocket)

    if (lxSocket.isReady) {
      accessLog.info('deconnection', lxSocket.userInfo?.name, lxSocket.keyInfo?.deviceName)
      if (!serverStatus.devices.map((d: any) => getUserName(d.clientId)).filter((n: any) => n === lxSocket.userInfo?.name).length) {
        handleUnconnection(lxSocket.userInfo?.name)
      }
    } else {
      const queryData = new URL(ws.data.reqUrl, currentHost).searchParams
      accessLog.info('deconnection', queryData.get('i'))
    }
  }

  return lxSocket
}

/** 提供给 Bun.serve 的原生 WebSocket 处理器 */
export const createBunWebSocketHandlers = () => {
  return {
    open(ws: ServerWebSocket<LX.SocketData>) {
      const socket = getOrCreateSocketAdapter(ws)
      activeClients.add(socket)
      void handleConnection(socket, ws.data.reqUrl)
    },
    message(ws: ServerWebSocket<LX.SocketData>, message: string | Buffer) {
      const msg = typeof message === 'string' ? message : message.toString('utf-8')
      const socket = getOrCreateSocketAdapter(ws)
      socket.isAlive = true

      if (Buffer.byteLength(msg, 'utf8') > MAX_SYNC_MESSAGE_BYTES) {
        syncLog.warn('sync message too large, closing connection')
        socket.close(SYNC_CLOSE_CODE.failed)
        return
      }

      if (msg === 'pong') return

      if (typeof (ws as any).__dispatchMessage === 'function') {
        ;(ws as any).__dispatchMessage(msg)
      }
    },
    pong(ws: ServerWebSocket<LX.SocketData>) {
      const socket = getOrCreateSocketAdapter(ws)
      socket.isAlive = true
    },
    close(ws: ServerWebSocket<LX.SocketData>) {
      if (typeof (ws as any).__dispatchClose === 'function') {
        ;(ws as any).__dispatchClose()
      }
    },
  }
}

/** 初始化 WebSocket 多设备同步服务与全局事件绑定 */
export const setupSyncServer = (host: string): LX.SocketServer => {
  currentHost = host

  socketServerInstance = {
    clients: activeClients,
    close() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
      }
      for (const client of activeClients) {
        client.close(SYNC_CLOSE_CODE.normal)
      }
      activeClients.clear()
    },
  }

  // WebDAV 同步进度广播
  if (global.lx.webdavSync) {
    global.lx.webdavSync.removeAllListeners('progress')
    global.lx.webdavSync.on('progress', (data: any) => {
      if (socketServerInstance) {
        const msg = JSON.stringify({ type: 'webdav_progress', data })
        for (const client of socketServerInstance.clients) {
          if (client.readyState === 1) {
            client.send(msg)
          }
        }
      }
    })
  }

  // 30 秒心跳轮询保活
  if (heartbeatInterval) clearInterval(heartbeatInterval)
  heartbeatInterval = setInterval(() => {
    if (!socketServerInstance) return
    for (const socket of [...socketServerInstance.clients]) {
      if (socket.isAlive === false) {
        syncLog.info('alive check false:', socket.userInfo?.name, socket.keyInfo?.deviceName)
        socket.terminate?.()
        continue
      }

      socket.isAlive = false
      socket.ping()
      if (socket.keyInfo?.isMobile) socket.send('ping')
    }
  }, 30000)

  void registerLocalSyncEvent(socketServerInstance)
  return socketServerInstance
}

export const getSyncDevices = async (userName: string) => {
  const userSpace = getUserSpace(userName)
  return userSpace.getDecices()
}

export const removeSyncDevice = async (userName: string, clientId: string) => {
  if (socketServerInstance) {
    for (const client of socketServerInstance.clients) {
      if (client.userInfo?.name === userName && client.keyInfo?.clientId === clientId) {
        client.close(SYNC_CLOSE_CODE.normal)
      }
    }
  }
  const userSpace = getUserSpace(userName)
  await userSpace.removeDevice(clientId)
}
