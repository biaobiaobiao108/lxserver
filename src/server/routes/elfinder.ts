import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import formidable from 'formidable'
import { Router, type HttpContext } from '../core'
import { verifyAdminAuth } from '../auth'
import { ElFinderConnector, getSystemRoot } from '../elfinderConnector'

const getMime = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

/** 注册 elFinder 文件管理器连接器路由 */
export const createElFinderRouter = (): Router => {
  const router = new Router()

  router.use('/api/elfinder/connector', async (ctx, next) => {
    if (!verifyAdminAuth(ctx.request, true, ctx.url)) {
      return ctx.text('Unauthorized', 401)
    }
    return await next()
  })

  // 1. 处理 GET 请求
  router.get('/api/elfinder/connector', async (ctx) => {
    try {
      const params: Record<string, string> = {}
      ctx.url.searchParams.forEach((value, key) => {
        params[key] = value
      })

      const connector = new ElFinderConnector(getSystemRoot())
      const cmd = params.cmd || 'open'
      const result = await connector.handle(cmd, params)

      if ((cmd === 'file' || cmd === 'zipdl') && result.path && !result.error) {
        if (fs.existsSync(result.path)) {
          const mime = getMime(result.path)
          const headers: Record<string, string> = { 'Content-Type': mime }

          if (params.download === '1' || cmd === 'zipdl') {
            headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(path.basename(result.path))}"`
          }

          return new Response(Bun.file(result.path), {
            status: 200,
            headers,
          })
        }
        return ctx.text('Not Found', 404)
      }

      return ctx.json(result)
    } catch (err: any) {
      return ctx.json({ error: [err.message] }, 500)
    }
  })

  // 2. 处理 POST 请求 (multipart 上传与普通指令)
  router.post('/api/elfinder/connector', async (ctx) => {
    const contentType = ctx.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      // 通过 node:http 模拟方式由 formidable 处理多文件上传
      return await new Promise<Response>((resolve) => {
        const form = formidable({ multiples: true, uploadDir: os.tmpdir() })
        const mockReq: any = {
          method: 'POST',
          url: ctx.request.url,
          headers: Object.fromEntries(ctx.headers.entries()),
          on(event: string, callback: (arg?: any) => void) {
            if (event === 'data') {
              void ctx.request.arrayBuffer().then(buf => callback(Buffer.from(buf)))
            } else if (event === 'end') {
              setTimeout(() => callback(), 5)
            }
            return mockReq
          },
        }

        form.parse(mockReq, async (err: any, fields: any, files: any) => {
          if (err) {
            resolve(ctx.json({ error: ['Upload error'] }, 500))
            return
          }

          const params = { ...fields }
          for (const key in params) {
            if (Array.isArray(params[key]) && params[key].length === 1) {
              params[key] = params[key][0]
            }
          }

          try {
            const uploadedFiles = files.upload || files['upload[]'] || Object.values(files)[0]
            if (params.cmd === 'upload' && uploadedFiles) {
              const connector = new ElFinderConnector(getSystemRoot())
              const uploadFiles = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles]
              const added: any[] = []

              for (const file of uploadFiles) {
                const target = (connector as any).decode(params.target)
                const destPath = path.join(target, file.originalFilename || file.newFilename)
                await fs.promises.copyFile(file.filepath, destPath)
                await fs.promises.unlink(file.filepath)

                const fileInfo = await (connector as any).getFileInfo(destPath)
                if (fileInfo) added.push(fileInfo)
              }

              resolve(ctx.json({ added }))
            } else {
              const connector = new ElFinderConnector(getSystemRoot())
              const cmd = params.cmd || 'open'
              const result = await connector.handle(cmd, params)
              resolve(ctx.json(result))
            }
          } catch (itemErr: any) {
            resolve(ctx.json({ error: [itemErr.message] }, 500))
          }
        })
      })
    }

    // 普通 POST 指令 (JSON 或 URLSearchParams)
    try {
      const body = await ctx.bodyText()
      let params: any = {}
      try {
        params = JSON.parse(body || '{}')
      } catch {
        const urlParams = new URLSearchParams(body)
        urlParams.forEach((value, key) => {
          if (params[key]) {
            if (Array.isArray(params[key])) {
              params[key].push(value)
            } else {
              params[key] = [params[key], value]
            }
          } else {
            params[key] = value
          }
        })
      }

      const connector = new ElFinderConnector(getSystemRoot())
      const cmd = params.cmd || 'open'
      const result = await connector.handle(cmd, params)
      return ctx.json(result)
    } catch (err: any) {
      return ctx.json({ error: [err.message] }, 500)
    }
  })

  return router
}
