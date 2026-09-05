export interface UserApiStore {
  status: boolean
  message: string
  apis: Record<string, any>
}

export const apiSource = { value: 'temp' }
export const userApi: UserApiStore = {
  status: false,
  message: '',
  apis: {},
}
