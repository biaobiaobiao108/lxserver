import http, { type IncomingMessage } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { registerLocalSyncEvent, callObj, sync } from './index'
import { authConnect } from '../auth'
import { getAddress, sendStatus, decryptMsg, encryptMsg } from '@/utils/tools'
import { accessLog, syncLog } from '@/utils/log4js'
import { SYNC_CODE, SYNC_CLOSE_CODE } from '@/constants'
import { getUserSpace, releaseUserSpace, getUserName } from '@/user'
import { createMsg2call } from 'message2call'
import { serverStatus } from '../state'

let wss: LX.SocketServer | null = null
let currentHost = 'http://localhost'

function noop() {}

function onSocketError(err: Error) {
  console.error(err)
}

const checkDuplicateClient = (newSocket: LX.Socket) => {
  if (!wss) return
  for (const client of [...wss.clients]) {
    if (client === newSocket || client.keyInfo?.clientId !== newSocket.keyInfo?.clientId) continue
    syncLog.info('duplicate client', client.userInfo?.name, client.keyInfo?.deviceName)
    client.isReady = false
    for (const name of Object.keys(client.moduleReadys) as Array<keyof LX.Socket['moduleReadys']>) {
      client.moduleReadys[name] = false
    }
    client.close(SYNC_CLOSE_CODE.normal)
  }
}

const handleConnection = async (socket: LX.Socket, request: IncomingMessage) => {
  const queryData = new URL(request.url as string, currentHost).searchParams
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

const authConnection = (req: http.IncomingMessage, callback: (err: string | null | undefined, success: boolean) => void) => {
  authConnect(req).then(() => {
    callback(null, true)
  }).catch(() => {
    callback(null, false)
  })
}

/** 初始化 WebSocket 多设备同步服务 */
export const setupSyncServer = (httpServer: http.Server, host: string): LX.SocketServer => {
  currentHost = host
  wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
  }) as LX.SocketServer

  // WebDAV 同步进度向 WebSocket 客户端广播
  if (global.lx.webdavSync) {
    global.lx.webdavSync.removeAllListeners('progress')
    global.lx.webdavSync.on('progress', (data: any) => {
      if (wss) {
        const msg = JSON.stringify({ type: 'webdav_progress', data })
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(msg)
          }
        }
      }
    })
  }

  wss.on('connection', function (socket: any, request: IncomingMessage) {
    socket.isReady = false
    socket.moduleReadys = {
      list: false,
      dislike: false,
    }
    socket.feature = {
      list: false,
      dislike: false,
    }
    socket.on('pong', () => {
      socket.isAlive = true
    })

    let closeEvents: Array<(err: Error) => (void | Promise<void>)> = []
    let disconnected = false
    const msg2call = createMsg2call<LX.Sync.ClientSyncActions>({
      funcsObj: callObj,
      timeout: 120 * 1000,
      sendMessage(data: any) {
        if (disconnected) throw new Error('disconnected')
        void encryptMsg(socket.keyInfo, JSON.stringify(data)).then((encryptedData: string) => {
          socket.send(encryptedData)
        }).catch(err => {
          syncLog.error('encrypt message error:', err)
          socket.close(SYNC_CLOSE_CODE.failed)
        })
      },
      onCallBeforeParams(rawArgs: any[]) {
        return [socket, ...rawArgs]
      },
      onError(error: Error, path: string[], groupName: string | null) {
        const name = groupName ?? ''
        const userName = socket.userInfo?.name ?? ''
        const deviceName = socket.keyInfo?.deviceName ?? ''
        syncLog.error(`sync call ${userName} ${deviceName} ${name} ${path.join('.')} error:`, error)
      },
    })
    socket.remote = msg2call.remote
    socket.remoteQueueList = msg2call.createQueueRemote('list')
    socket.remoteQueueDislike = msg2call.createQueueRemote('dislike')
    socket.addEventListener('message', ({ data }: any) => {
      if (typeof data !== 'string') return
      void decryptMsg(socket.keyInfo, data).then((decryptedData) => {
        let syncData: any
        try {
          syncData = JSON.parse(decryptedData)
        } catch (err) {
          syncLog.error('parse message error:', err)
          socket.close(SYNC_CLOSE_CODE.failed)
          return
        }
        msg2call.message(syncData)
      }).catch(err => {
        syncLog.error('decrypt message error:', err)
        socket.close(SYNC_CLOSE_CODE.failed)
      })
    })
    socket.addEventListener('close', () => {
      const err = new Error('closed')
      try {
        for (const handler of closeEvents) void handler(err)
      } catch (err: any) {
        syncLog.error(err?.message)
      }
      closeEvents = []
      disconnected = true
      msg2call.destroy()
      if (socket.isReady) {
        accessLog.info('deconnection', socket.userInfo.name, socket.keyInfo.deviceName)
        if (!serverStatus.devices.map((d: any) => getUserName(d.clientId)).filter((n: any) => n === socket.userInfo.name).length) {
          handleUnconnection(socket.userInfo.name)
        }
      } else {
        const queryData = new URL(request.url as string, currentHost).searchParams
        accessLog.info('deconnection', queryData.get('i'))
      }
    })
    socket.onClose = function (handler: typeof closeEvents[number]) {
      closeEvents.push(handler)
      return () => {
        closeEvents.splice(closeEvents.indexOf(handler), 1)
      }
    }
    socket.broadcast = function (handler: (client: LX.Socket) => void) {
      if (!wss) return
      for (const client of wss.clients) handler(client)
    }

    void handleConnection(socket, request)
  })

  httpServer.on('upgrade', function upgrade(request, socket, head) {
    socket.addListener('error', onSocketError)

    authConnection(request, (err, success) => {
      if (err || !success) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      socket.removeListener('error', onSocketError)
      delete request.headers['sec-websocket-extensions']
      wss?.handleUpgrade(request, socket, head, function done(ws) {
        wss?.emit('connection', ws, request)
      })
    })
  })

  const interval = setInterval(() => {
    wss?.clients.forEach(socket => {
      if (socket.isAlive === false) {
        syncLog.info('alive check false:', socket.userInfo?.name, socket.keyInfo?.deviceName)
        socket.terminate()
        return
      }

      socket.isAlive = false
      socket.ping(noop)
      if (socket.keyInfo?.isMobile) socket.send('ping', noop)
    })
  }, 30000)

  wss.on('close', function close() {
    clearInterval(interval)
  })

  void registerLocalSyncEvent(wss)
  return wss
}

export const getSyncDevices = async (userName: string) => {
  const userSpace = getUserSpace(userName)
  return userSpace.getDecices()
}

export const removeSyncDevice = async (userName: string, clientId: string) => {
  if (wss) {
    for (const client of wss.clients) {
      if (client.userInfo?.name === userName && client.keyInfo?.clientId === clientId) {
        client.close(SYNC_CLOSE_CODE.normal)
      }
    }
  }
  const userSpace = getUserSpace(userName)
  await userSpace.removeDevice(clientId)
}
