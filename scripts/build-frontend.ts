import path from 'path'
import fs from 'fs'

const isWatch = process.argv.includes('--watch')

async function build() {
  const startTime = performance.now()
  const adminEntry = path.join(import.meta.dir, '../frontend/admin/src/index.ts')
  const playerEntry = path.join(import.meta.dir, '../frontend/player/src/index.ts')
  const playerVendorEntry = path.join(import.meta.dir, '../frontend/player/src/vendor_bridge.ts')
  const shouldMinify = process.env.NODE_ENV === 'production' || !isWatch

  const stylesProcess = Bun.spawn(['bun', 'run', 'scripts/build-styles.ts'], {
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const stylesExitCode = await stylesProcess.exited
  if (stylesExitCode !== 0) {
    console.error('[Tailwind] Style build failed')
    if (!isWatch) process.exit(1)
    return
  }

  const vendorResult = await Bun.build({
    entrypoints: [playerVendorEntry],
    outdir: path.join(import.meta.dir, '../public/music/js'),
    naming: 'vendor-bridge.js',
    format: 'iife',
    minify: shouldMinify,
    target: 'browser',
    sourcemap: isWatch ? 'inline' : 'none',
  })
  if (!vendorResult.success) {
    console.error('[Bun Bundler] Player vendor build failed:', vendorResult.logs)
    if (!isWatch) process.exit(1)
    return
  }

  // 1. Build Admin Panel
  const adminResult = await Bun.build({
    entrypoints: [adminEntry],
    outdir: path.join(import.meta.dir, '../public'),
    naming: 'app.js',
    minify: shouldMinify,
    target: 'browser',
    sourcemap: isWatch ? 'inline' : 'none',
  })
  if (!adminResult.success) {
    console.error('[Bun Bundler] Admin build failed:', adminResult.logs)
    if (!isWatch) process.exit(1)
    return
  }

  // 2. Build Music Player
  const playerOutdir = path.join(import.meta.dir, '../public/music')
  const playerChunkDir = path.join(playerOutdir, 'js/chunks')
  if (fs.existsSync(playerChunkDir)) fs.rmSync(playerChunkDir, { recursive: true, force: true })
  for (const filename of fs.readdirSync(playerOutdir)) {
    if (filename.startsWith('chunk-') && filename.endsWith('.js')) {
      fs.rmSync(path.join(playerOutdir, filename), { force: true })
    }
  }

  const playerResult = await Bun.build({
    entrypoints: [playerEntry],
    outdir: playerOutdir,
    naming: {
      entry: 'app.js',
      chunk: 'js/chunks/[name]-[hash].[ext]',
    },
    format: 'esm',
    splitting: true,
    minify: shouldMinify,
    target: 'browser',
    sourcemap: isWatch ? 'inline' : 'none',
  })
  if (!playerResult.success) {
    console.error('[Bun Bundler] Player build failed:', playerResult.logs)
    if (!isWatch) process.exit(1)
    return
  }

  const duration = (performance.now() - startTime).toFixed(1)
  const adminSize = (fs.statSync(path.join(import.meta.dir, '../public/app.js')).size / 1024).toFixed(1)
  const playerSize = (fs.statSync(path.join(import.meta.dir, '../public/music/app.js')).size / 1024).toFixed(1)
  console.log(`[Bun Bundler] Frontend build completed in ${duration}ms (admin: ${adminSize}KB, player: ${playerSize}KB, minified: ${shouldMinify})`)
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
