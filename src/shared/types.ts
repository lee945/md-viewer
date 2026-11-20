export type ColorScheme = 'light' | 'dark'

export interface FileInfo {
  path: string
  content: string
  /** 实际用于解码的编码名，例如 utf8 / gb18030 / utf16le */
  encoding: string
  hasBOM: boolean
  lineEnding: 'LF' | 'CRLF'
  size: number
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface DesktopAPI {
  openFileDialog(): Promise<IpcResult<FileInfo | null>>
  openPath(path: string): Promise<IpcResult<FileInfo>>
  takeStartupFile(): Promise<string | null>
  getPathForFile(file: unknown): string
  onOpenFileFromMain(cb: (path: string) => void): () => void
  onMenuOpenFile(cb: () => void): () => void
  setThemeSource(theme: ColorScheme): void
  openExternal(url: string): void
}
