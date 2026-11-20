function normalize(input: string): string {
  const unified = input.replace(/\//g, '\\')
  const drive = /^[a-zA-Z]:/.exec(unified)?.[0]?.toLowerCase() ?? ''
  const parts: string[] = []
  for (const segment of unified.slice(drive.length).split('\\')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      parts.pop()
      continue
    }
    parts.push(segment.toLowerCase())
  }
  return `${drive}\\${parts.join('\\')}`
}

export function baseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? filePath
}

/** Windows 语义：大小写不敏感、分隔符统一、折叠 . 与 .. */
export function isPathInside(root: string, target: string): boolean {
  const r = normalize(root)
  const t = normalize(target)
  return t === r || t.startsWith(r.endsWith('\\') ? r : `${r}\\`)
}
