import fs from 'node:fs'
import path from 'node:path'

/** Validate a value that will be used as one filesystem path segment. */
export const assertSafePathSegment = (value: unknown, label = 'path segment'): string => {
  if (typeof value !== 'string' || value.length === 0 || value === '.' || value === '..') {
    throw new Error(`Invalid ${label}`)
  }
  if (value.length > 128 || value.includes('\0') || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
  if (value.includes('/') || value.includes('\\') || path.isAbsolute(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

export const isPathInside = (root: string, target: string): boolean => {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

/** Resolve a path and also protect against symlink escapes where possible. */
export const resolveInside = (root: string, ...parts: string[]): string => {
  const resolvedRoot = path.resolve(root)
  const candidate = path.resolve(resolvedRoot, ...parts)
  if (!isPathInside(resolvedRoot, candidate)) throw new Error('Path escapes allowed directory')

  const realRoot = fs.existsSync(resolvedRoot) ? fs.realpathSync.native(resolvedRoot) : resolvedRoot
  const probe = fs.existsSync(candidate) ? candidate : path.dirname(candidate)
  if (fs.existsSync(probe)) {
    const realProbe = fs.realpathSync.native(probe)
    if (!isPathInside(realRoot, realProbe)) throw new Error('Path escapes allowed directory')
  }
  return candidate
}
