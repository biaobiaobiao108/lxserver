/**
 * 全局服务端运行时状态管理
 */
export const serverStatus: LX.Sync.Status = {
  status: false,
  message: '',
  address: [],
  devices: [],
}

export const getServerStatus = (): LX.Sync.Status => serverStatus
