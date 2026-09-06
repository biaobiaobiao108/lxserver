import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'
import formidable from 'formidable'
import { Router, type HttpContext } from '../core'
import { verifyAdminAuth } from '../auth'
import { ElFinderConnector, getSystemRoot } from '../elfinderConnector'
import { assertSafePathSegment, resolveInside } from '@/utils/pathSecurity'

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
    if (!verifyAdminAuth(ctx.request)) {
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
        try {
          if (cmd === 'file') resolveInside(getSystemRoot(), result.path)
          else resolveInside(os.tmpdir(), result.path)
        } catch {
          return ctx.text('Forbidden', 403)
        }
        if (fs.existsSync(result.path)) {
          const mime = getMime(result.path)
          const headers: Record<string, string> = { 'Content-Type': mime }

          if (params.download === '1' || cmd === 'zipdl') {
            headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(path.basename(result.path))}"`
          }

          if (cmd === 'zipdl') {
            setTimeout(() => {
              try { if (fs.existsSync(result.path)) fs.unlinkSync(result.path) } catch { }
            }, 10_000)
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
        const contentLength = Number(ctx.headers.get('content-length') || 0)
        if (Number.isFinite(contentLength) && contentLength > 1024 * 1024 * 1024) {
          resolve(ctx.json({ error: ['Upload is too large'] }, 413))
          return
        }
        const form = formidable({
          multiples: true,
          uploadDir: os.tmpdir(),
          maxFileSize: 512 * 1024 * 1024,
          maxTotalFileSize: 1024 * 1024 * 1024,
          maxFields: 100,
          maxFieldsSize: 5 * 1024 * 1024,
        })
        const maxUploadBytes = 1024 * 1024 * 1024
        const requestBody = ctx.request.body
        if (!requestBody) {
          resolve(ctx.json({ error: ['Upload body is missing'] }, 400))
          return
        }
        const bodyStream = Readable.from((async function* () {
          const reader = requestBody.getReader()
          let totalBytes = 0
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              totalBytes += value.byteLength
              if (totalBytes > maxUploadBytes) throw new Error('Upload is too large')
              yield Buffer.from(value)
            }
          } finally {
            reader.releaseLock()
          }
        })())
        const mockReq: any = bodyStream
        mockReq.method = 'POST'
        mockReq.url = ctx.request.url
        mockReq.headers = Object.fromEntries(ctx.headers.entries())

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
                const target = connector.decode(params.target)
                const filename = assertSafePathSegment(file.originalFilename || file.newFilename, 'uploaded filename')
                const destPath = resolveInside(getSystemRoot(), target, filename)
                await fs.promises.copyFile(file.filepath, destPath)
                await fs.promises.unlink(file.filepath)

                const fileInfo = await connector.getFileInfo(destPath)
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
