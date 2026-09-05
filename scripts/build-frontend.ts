import path from 'path'

console.log('[Bun Bundler] Building frontend assets...')

async function build() {
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
    process.exit(1)
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
    process.exit(1)
  }

  console.log('[Bun Bundler] Frontend build completed successfully!')
}

build().catch(err => {
  console.error('[Bun Bundler] Error:', err)
  process.exit(1)
})
