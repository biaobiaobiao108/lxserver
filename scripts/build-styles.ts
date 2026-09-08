import path from 'node:path'

const root = path.join(import.meta.dir, '..')

async function buildStyle(config: string, input: string, output: string) {
  const process = Bun.spawn([
    'bun',
    'run',
    'tailwindcss',
    '-c',
    path.join(root, config),
    '-i',
    path.join(root, input),
    '-o',
    path.join(root, output),
    '--minify',
  ], { stdout: 'inherit', stderr: 'inherit' })

  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new Error(`Tailwind build failed for ${input} (exit code ${exitCode})`)
  }
}

await Promise.all([
  buildStyle(
    'tailwind.admin.config.cjs',
    'frontend/styles/admin.css',
    'public/tailwind.generated.css',
  ),
  buildStyle(
    'tailwind.player.config.cjs',
    'frontend/styles/player.css',
    'public/music/css/tailwind.generated.css',
  ),
])
