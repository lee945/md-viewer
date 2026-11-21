export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** 按出现顺序生成去重后的锚点 id，与 markdown-it 的 heading-ids 规则一致 */
export function uniqueHeadingId(used: Map<string, number>, text: string): string {
  const base = slugify(text) || 'section'
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}
