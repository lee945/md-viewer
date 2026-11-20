export function dirname(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return idx >= 0 ? filePath.slice(0, idx) : filePath
}

export function resolveRelative(baseFilePath: string, ref: string): string | null {
  if (!ref) return null
  if (/^[a-zA-Z][\w+.-]*:/.test(ref)) return null

  const withoutHash = ref.split('#')[0].split('?')[0]
  if (!withoutHash) return null

  let decoded = withoutHash
  try {
    decoded = decodeURIComponent(withoutHash)
  } catch {
    decoded = withoutHash
  }

  const normalized = decoded.replace(/\//g, '\\')
  if (/^[a-zA-Z]:\\/.test(normalized)) return normalized
  if (normalized.startsWith('\\\\')) return normalized

  const drive = /^[a-zA-Z]:/.exec(baseFilePath)?.[0] ?? ''
  const baseParts = normalized.startsWith('\\')
    ? drive
      ? [drive]
      : []
    : dirname(baseFilePath).split('\\').filter(Boolean)
  for (const segment of normalized.split('\\')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      baseParts.pop()
      continue
    }
    baseParts.push(segment)
  }

  return baseParts.join('\\')
}

export function toAssetUrl(absolutePath: string): string {
  return `md-asset://local/?p=${encodeURIComponent(absolutePath)}`
}
