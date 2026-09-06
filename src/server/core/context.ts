import path from 'node:path'

export interface ContextOptions {
  remoteAddress?: string
}

export class HttpContext {
  readonly request: Request
  readonly url: URL
  readonly pathname: string
  readonly method: string
  readonly query: URLSearchParams
  readonly headers: Headers
  readonly state = new Map<string, any>()
  readonly params: Record<string, string> = {}
  readonly remoteAddress: string

  private _cookies: Record<string, string> | null = null

  constructor(request: Request, options?: ContextOptions) {
    this.request = request
    this.url = new URL(request.url)
    this.pathname = this.url.pathname
    this.method = request.method.toUpperCase()
    this.query = this.url.searchParams
    this.headers = request.headers
    this.remoteAddress = options?.remoteAddress ?? this.extractIP()
  }

  /** 获取客户端真实 IP（优先从反向代理头获取） */
  private extractIP(): string {
    if (global.lx?.config?.['proxy.enabled']) {
      const headerName = (global.lx.config['proxy.header'] || 'x-forwarded-for').toLowerCase()
      const forwarded = this.headers.get(headerName)
      if (forwarded) {
        const first = forwarded.split(',')[0]?.trim()
        if (first) return first
      }
    }
    return '127.0.0.1'
  }

  /** Cookie 延迟解析 */
  get cookies(): Record<string, string> {
    if (this._cookies) return this._cookies
    const cookieHeader = this.headers.get('cookie')
    if (!cookieHeader) {
      this._cookies = {}
      return this._cookies
    }
    const parsed: Record<string, string> = {}
    for (const item of cookieHeader.split(';')) {
      const [key, ...rest] = item.trim().split('=')
      if (key) {
        try {
          parsed[key.trim()] = decodeURIComponent(rest.join('='))
        } catch {
          parsed[key.trim()] = rest.join('=')
        }
      }
    }
    this._cookies = parsed
    return this._cookies
  }

  /** 解析 JSON 请求体 */
  async bodyJson<T = any>(): Promise<T> {
    try {
      return JSON.parse(await this.readBodyText()) as T
    } catch {
      throw new Error('Invalid JSON body')
    }
  }

  /** 解析纯文本请求体 */
  async bodyText(): Promise<string> {
    return this.readBodyText()
  }

  private async readBodyText(maxBytes = 20 * 1024 * 1024): Promise<string> {
    const declaredLength = Number(this.headers.get('content-length') || 0)
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error('Request body is too large')
    }

    if (!this.request.body) return ''
    const reader = this.request.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value)
        total += chunk.byteLength
        if (total > maxBytes) {
          await reader.cancel()
          throw new Error('Request body is too large')
        }
        chunks.push(chunk)
      }
    } finally {
      reader.releaseLock()
    }

    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new TextDecoder().decode(bytes)
  }

  /** 原生 FormData 解析 (用于大文件/表单上传，零第三方依赖) */
  async formData(): Promise<FormData> {
    return await this.request.formData()
  }

  /** 构造 JSON 响应 */
  json(data: any, status = 200, headers?: HeadersInit): Response {
    return Response.json(data, {
      status,
      headers,
    })
  }

  /** 构造文本响应 */
  text(content: string, status = 200, headers?: HeadersInit): Response {
    return new Response(content, {
      status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        ...headers,
      },
    })
  }

  /** 构造 HTML 响应 */
  html(content: string, status = 200, headers?: HeadersInit): Response {
    return new Response(content, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...headers,
      },
    })
  }

  /** 构造重定向响应 */
  redirect(url: string, status: 301 | 302 | 307 | 308 = 302): Response {
    return new Response(null, {
      status,
      headers: {
        Location: url,
      },
    })
  }

  /**
   * 基于 Bun.file 原生零拷贝分发静态文件或音频流
   * 自动支持 HTTP 206 Partial Content (Range requests) 与 mime 类型识别
   */
  file(filePath: string, options?: { status?: number; headers?: HeadersInit }): Response {
    const bunFile = Bun.file(path.resolve(filePath))
    return new Response(bunFile, {
      status: options?.status ?? 200,
      headers: options?.headers,
    })
  }

  /** 构造空响应 (如 204 No Content) */
  empty(status = 204, headers?: HeadersInit): Response {
    return new Response(null, {
      status,
      headers,
    })
  }
}
