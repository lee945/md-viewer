import fs from 'node:fs'

const MARKDOWN_EXT = /\.(md|markdown|mdown|mkd|txt)$/i

/** 从命令行参数里找出第一个真实存在的 Markdown 路径 */
export function findMarkdownArg(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue
    if (!MARKDOWN_EXT.test(arg)) continue
    try {
      if (fs.statSync(arg).isFile()) return arg
    } catch {
      // 忽略不存在的参数
    }
  }
  return null
}
