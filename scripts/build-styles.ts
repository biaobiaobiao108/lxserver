import path from 'node:path'
import tailwindPlugin from 'bun-plugin-tailwind'

const root = path.join(import.meta.dir, '..')

async function buildStyle(input: string, output: string) {
  // Tailwind v4 is compiled as part of Bun's CSS bundle instead of spawning
  // the Tailwind CLI. The CSS entrypoint owns its explicit @config directive.
  const result = await Bun.build({
    entrypoints: [path.join(root, input)],
    outdir: path.dirname(path.join(root, output)),
    naming: path.basename(output),
    minify: true,
    target: 'browser',
    plugins: [tailwindPlugin],
  })

  if (!result.success) {
    throw new Error(`Tailwind build failed for ${input}: ${result.logs.join('\n')}`)
  }
}

await Promise.all([
  buildStyle(
    'frontend/styles/admin.css',
    'public/tailwind.generated.css',
  ),
  buildStyle(
    'frontend/styles/player.css',
    'public/music/css/tailwind.generated.css',
  ),
])
