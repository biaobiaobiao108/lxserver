import path from 'path'
import fs from 'fs'

const isWatch = process.argv.includes('--watch')

async function build() {
  const startTime = performance.now()
  const adminEntry = path.join(import.meta.dir, '../frontend/admin/src/index.ts')
  const playerEntry = path.join(import.meta.dir, '../frontend/player/src/index.ts')

  // 1. Build Admin Panel
  const adminResult = await Bun.build({
    entrypoints: [adminEntry],
    outdir: path.join(import.meta.dir, '../public'),
    naming: 'app.js',
    minify: process.env.NODE_ENV === 'production',
    target: 'browser',
  })
  if (!adminResult.success) {
    console.error('[Bun Bundler] Admin build failed:', adminResult.logs)
    if (!isWatch) process.exit(1)
    return
  }

  // 2. Build Music Player
  const playerResult = await Bun.build({
    entrypoints: [playerEntry],
    outdir: path.join(import.meta.dir, '../public/music'),
    naming: 'app.js',
    minify: process.env.NODE_ENV === 'production',
    target: 'browser',
  })
  if (!playerResult.success) {
    console.error('[Bun Bundler] Player build failed:', playerResult.logs)
    if (!isWatch) process.exit(1)
    return
  }

  const duration = (performance.now() - startTime).toFixed(1)
  console.log(`[Bun Bundler] Frontend build completed in ${duration}ms`)
}

async function main() {
  console.log(`[Bun Bundler] Building frontend assets... ${isWatch ? '(watch mode)' : ''}`)
  await build()

  if (isWatch) {
    const adminSrc = path.join(import.meta.dir, '../frontend/admin/src')
    const playerSrc = path.join(import.meta.dir, '../frontend/player/src')
    let debounceTimer: Timer | null = null

    const onChange = (filename: string | null) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        console.log(`[Bun Bundler] File changed: ${filename || 'unknown'}, rebuilding...`)
        await build()
      }, 100)
    }

    if (fs.existsSync(adminSrc)) fs.watch(adminSrc, { recursive: true }, (_, f) => onChange(f))
    if (fs.existsSync(playerSrc)) fs.watch(playerSrc, { recursive: true }, (_, f) => onChange(f))
    console.log('[Bun Bundler] Watching for changes in frontend/ ...')
  }
}

main().catch(err => {
  console.error('[Bun Bundler] Error:', err)
  process.exit(1)
})
