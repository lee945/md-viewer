export interface BlockRect {
  /** 1 基起始行（含） */
  startLine: number
  /** 1 基结束行（不含，等于最后一行 + 1） */
  endLine: number
  top: number
  height: number
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** 源码行号（可带小数）→ 预览纵向像素位置 */
export function lineToTop(blocks: BlockRect[], line: number): number {
  if (blocks.length === 0) return 0
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  if (line <= first.startLine) return first.top
  if (line >= last.endLine) return last.top + last.height

  for (const block of blocks) {
    if (line >= block.startLine && line < block.endLine) {
      const span = Math.max(1, block.endLine - block.startLine)
      return block.top + ((line - block.startLine) / span) * block.height
    }
  }

  // 落在块之间的空行区域：在相邻两块之间线性插值
  let prev = first
  for (const block of blocks) {
    if (block.startLine > line) {
      const lineSpan = Math.max(1, block.startLine - prev.endLine)
      const ratio = clamp01((line - prev.endLine) / lineSpan)
      const topStart = prev.top + prev.height
      return topStart + (block.top - topStart) * ratio
    }
    prev = block
  }
  return last.top + last.height
}

/** 预览纵向像素位置 → 源码行号（可带小数） */
export function topToLine(blocks: BlockRect[], top: number): number {
  if (blocks.length === 0) return 1
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  if (top <= first.top) return first.startLine
  if (top >= last.top + last.height) return last.endLine

  for (const block of blocks) {
    if (top >= block.top && top < block.top + block.height) {
      const span = Math.max(1, block.endLine - block.startLine)
      return block.startLine + clamp01((top - block.top) / Math.max(1, block.height)) * span
    }
  }

  let prev = first
  for (const block of blocks) {
    if (block.top > top) {
      const gapStart = prev.top + prev.height
      const gapSpan = Math.max(1, block.top - gapStart)
      const ratio = clamp01((top - gapStart) / gapSpan)
      return prev.endLine + (block.startLine - prev.endLine) * ratio
    }
    prev = block
  }
  return last.endLine
}
