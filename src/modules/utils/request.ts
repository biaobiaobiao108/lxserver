import needle from 'needle'
import { debugRequest } from './env'
import { requestMsg } from './message'
import { bHh } from './musicSdk/options'
import { deflateRaw } from 'node:zlib'
import * as tunnel from 'tunnel'

const httpsRxp = /^https:/

export interface HttpOptions extends Record<string, any> {
  method?: string
  headers?: Record<string, any>
  body?: any
  form?: any
  formData?: any
  format?: string
  timeout?: number
  json?: boolean
  jsonpCallback?: string
}

export interface HttpPromiseObject<T = any> {
  isCancelled: boolean
  cancelHttp: () => void
  promise: Promise<T>
  requestObj?: any
  cancelFn?: ((reason?: any) => void) | null
}

const getRequestAgent = async (url: string): Promise<any> => {
  const config = global.lx?.config || {}
  const proxyEnabled = config['proxy.all.enabled']
  const proxyAddress = config['proxy.all.address']

  if (proxyEnabled && proxyAddress) {
    try {
      const proxyUrl = new URL(proxyAddress)
      if (proxyUrl.protocol === 'http:' || proxyUrl.protocol === 'https:') {
        const isHttps = httpsRxp.test(url)
        const tunnelOptions = {
          proxy: {
            host: proxyUrl.hostname,
            port: parseInt(proxyUrl.port, 10),
            proxyAuth: proxyUrl.username ? `${proxyUrl.username}:${proxyUrl.password}` : undefined,
          },
        }
        return (isHttps ? tunnel.httpsOverHttp : tunnel.httpOverHttp)(tunnelOptions)
      } else if (proxyUrl.protocol.startsWith('socks')) {
        const { SocksProxyAgent } = await import('socks-proxy-agent')
        return new SocksProxyAgent(proxyAddress)
      }
    } catch {
      // ignore invalid proxy address
    }
  }

  if (process.env.HTTPS_PROXY) {
    try {
      const proxyUrl = new URL(process.env.HTTPS_PROXY)
      const tunnelOptions = {
        proxy: {
          host: proxyUrl.hostname,
          port: parseInt(proxyUrl.port, 10),
          proxyAuth: proxyUrl.username ? `${proxyUrl.username}:${proxyUrl.password}` : undefined,
        },
      }
      return (httpsRxp.test(url) ? tunnel.httpsOverHttp : tunnel.httpOverHttp)(tunnelOptions)
    } catch {
      // ignore
    }
  }

  return undefined
}

const request = (url: string, options: HttpOptions, callback: (err: any, resp: any, body: any) => void) => {
  let data: any
  if (options.body) {
    data = options.body
  } else if (options.form) {
    data = options.form
    options.json = false
  } else if (options.formData) {
    data = options.formData
    options.json = false
  }
  options.response_timeout = options.timeout

  const method = (options.method as needle.NeedleHttpVerbs) || 'get'
  const stream = needle.request(method, url, data, options, (err, resp, body) => {
    if (!err && resp) {
      body = resp.body = resp.raw.toString()
      try {
        resp.body = JSON.parse(resp.body)
      } catch {
        // ignore
      }
      body = resp.body
    }
    callback(err, resp, body)
  })
  return (stream as any)?.request
}

const defaultHeaders: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

const buildHttpPromise = <T = any>(url: string, options: HttpOptions): HttpPromiseObject<T> => {
  const obj: HttpPromiseObject<T> = {
    isCancelled: false,
    cancelHttp: () => {
      if (!obj.requestObj) {
        obj.isCancelled = true
        return
      }
      cancelHttp(obj.requestObj)
      obj.requestObj = null
      if (obj.cancelFn) obj.cancelFn(new Error(requestMsg.cancelRequest))
      obj.cancelFn = null
    },
    promise: Promise.resolve() as any,
  }

  obj.promise = new Promise<T>((resolve, reject) => {
    obj.cancelFn = reject
    if (debugRequest) console.log(`\n---send request------${url}------------`)
    fetchData(url, options.method || 'get', options, (err, resp, body) => {
      if (debugRequest) console.log(`\n---response------${url}------------\n`, body)
      obj.requestObj = null
      obj.cancelFn = null
      if (err) return reject(err)
      resolve(resp)
    }).then(ro => {
      obj.requestObj = ro
      if (obj.isCancelled) obj.cancelHttp()
    })
  })
  return obj
}

export const httpFetch = <T = any>(url: string, options: HttpOptions = { method: 'get' }): HttpPromiseObject<T> => {
  const requestObj = buildHttpPromise<T>(url, options)
  requestObj.promise = requestObj.promise.catch((err: any) => {
    if (err.message === 'socket hang up') {
      return Promise.reject(new Error(requestMsg.unachievable))
    }
    switch (err.code) {
      case 'ETIMEDOUT':
      case 'ESOCKETTIMEDOUT':
        return Promise.reject(new Error(requestMsg.timeout))
      case 'ENOTFOUND':
        return Promise.reject(new Error(requestMsg.notConnectNetwork))
      default:
        return Promise.reject(err)
    }
  })
  return requestObj
}

export const cancelHttp = (requestObj: any): void => {
  if (!requestObj) return
  if (!requestObj.abort) return
  requestObj.abort()
}

export const http = (url: string, options: any, cb?: (err: any, resp: any, body: any) => void): Promise<any> => {
  if (typeof options === 'function') {
    cb = options
    options = {}
  }
  options ||= {}
  if (options.method == null) options.method = 'get'

  if (debugRequest) console.log(`\n---send request------${url}------------`)
  return fetchData(url, options.method, options, (err, resp, body) => {
    if (debugRequest) console.log(`\n---response------${url}------------\n`, body)
    if (err && debugRequest) console.log(JSON.stringify(err))
    if (cb) cb(err, resp, body)
  })
}

export const httpGet = (url: string, options: any, callback?: (err: any, resp: any, body: any) => void): Promise<any> => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  options ||= {}

  if (debugRequest) console.log(`\n---send request-------${url}------------`)
  return fetchData(url, 'get', options, (err, resp, body) => {
    if (debugRequest) console.log(`\n---response------${url}------------\n`, body)
    if (err && debugRequest) console.log(JSON.stringify(err))
    if (callback) callback(err, resp, body)
  })
}

export const httpPost = (url: string, data: any, options: any, callback?: (err: any, resp: any, body: any) => void): Promise<any> => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  options ||= {}
  options.data = data

  if (debugRequest) console.log(`\n---send request-------${url}------------`)
  return fetchData(url, 'post', options, (err, resp, body) => {
    if (debugRequest) console.log(`\n---response------${url}------------\n`, body)
    if (err && debugRequest) console.log(JSON.stringify(err))
    if (callback) callback(err, resp, body)
  })
}

export const http_jsonp = (url: string, options: any, callback?: (err: any, resp: any, body: any) => void): Promise<any> => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  options ||= {}

  const jsonpCallback = 'jsonpCallback'
  if (url.indexOf('?') < 0) url += '?'
  url += `&${options.jsonpCallback}=${jsonpCallback}`
  options.format = 'script'

  if (debugRequest) console.log(`\n---send request-------${url}------------`)
  return fetchData(url, 'get', options, (err, resp, body) => {
    if (debugRequest) console.log(`\n---response------${url}------------\n`, body)
    if (err) {
      if (debugRequest) console.log(JSON.stringify(err))
    } else {
      try {
        body = JSON.parse(body.replace(new RegExp(`^${jsonpCallback}\\(({.*})\\)$`), '$1'))
      } catch {
        // ignore
      }
    }
    if (callback) callback(err, resp, body)
  })
}

const handleDeflateRaw = (data: Buffer | string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    deflateRaw(data, (err, buf) => {
      if (err) return reject(err)
      resolve(buf)
    })
  })

const regx = /(?:\d\w)+/g

const fetchData = async (
  url: string,
  method: string,
  { headers = {}, format = 'json', timeout = 15000, ...options }: HttpOptions,
  callback: (err: any, resp: any, body: any) => void
): Promise<any> => {
  headers = Object.assign({}, headers)
  if (headers[bHh]) {
    const path = url.replace(/^https?:\/\/[\w.:]+\//, '/')
    let s = Buffer.from(bHh, 'hex').toString()
    s = s.replace(s.substr(-1), '')
    s = Buffer.from(s, 'base64').toString()

    const v1 = '2050201'
    const v2 = '10'
    const v = v1.split('-')[0].split('.').map(n => (n.length < 3 ? n.padStart(3, '0') : n)).join('')

    headers[s] =
      !s ||
      `${(await handleDeflateRaw(Buffer.from(JSON.stringify(`${path}${v}`.match(regx), null, 1).concat(v)).toString('base64'))).toString('hex')}&${parseInt(v, 10)}${v2}`
    delete headers[bHh]
  }
  return request(
    url,
    {
      ...options,
      method,
      headers: Object.assign({}, defaultHeaders, headers),
      timeout,
      agent: await getRequestAgent(url),
      json: format === 'json',
      rejectUnauthorized: true,
    },
    (err, resp, body) => {
      if (err) return callback(err, null, null)
      callback(null, resp, body)
    }
  )
}

export const checkUrl = (url: string, options: HttpOptions = {}): Promise<void> => {
  return new Promise((resolve, reject) => {
    fetchData(url, 'head', options, (err, resp) => {
      if (err) return reject(err)
      if (resp?.statusCode === 200) {
        resolve()
      } else {
        reject(new Error(resp?.statusCode?.toString() || 'Request failed'))
      }
    })
  })
}
