export interface BunSocketData {
  reqUrl: string
  clientId: string
  userName: string
  remoteAddress: string
}

declare global {
  namespace LX {
    type SocketData = BunSocketData

    interface Socket {
      readyState: number
      isAlive?: boolean
      isReady: boolean
      keyInfo: LX.Sync.KeyInfo
      userInfo: LX.UserConfig
      feature: LX.Sync.EnabledFeatures
      moduleReadys: {
        list: boolean
        dislike: boolean
      }

      send(data: string | ArrayBuffer | Uint8Array, cb?: (err?: Error) => void): void
      close(code?: number, reason?: string): void
      ping(data?: any): void
      terminate?(): void

      addEventListener(type: string, listener: (...args: any[]) => void): void
      removeEventListener?(type: string, listener: (...args: any[]) => void): void

      onClose: (handler: (err: Error) => (void | Promise<void>)) => () => void
      broadcast: (handler: (client: LX.Socket) => void) => void

      remote: LX.Sync.ClientSyncActions
      remoteQueueList: LX.Sync.ClientSyncListActions
      remoteQueueDislike: LX.Sync.ClientSyncDislikeActions
    }

    interface SocketServer {
      clients: Set<Socket>
      close(): void
    }
  }
}

