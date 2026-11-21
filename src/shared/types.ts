import type { ThemePreset } from './themes'

export type ColorScheme = 'light' | 'dark'

export type FontFamilyKey = 'default' | 'serif' | 'kai'

export interface ReadingSettings {
  fontSize: number
  fontFamily: FontFamilyKey
  lineHeight: number
  contentWidth: number | null
}

export interface PrefsState {
  reading: ReadingSettings
  theme: ColorScheme
  preset: ThemePreset
  viewMode: ViewMode
}

export type ViewMode = 'read' | 'edit' | 'split'

export interface SaveMeta {
  encoding: string
  hasBOM: boolean
  lineEnding: 'LF' | 'CRLF'
}

export interface FileInfo {
  path: string
  content: string
  /** 实际用于解码的编码名，例如 utf8 / gb18030 / utf16le */
  encoding: string
  hasBOM: boolean
  lineEnding: 'LF' | 'CRLF'
  size: number
  mtime: number
}

export interface FileOpenResult {
  file: FileInfo
  workspaceRoot: string
}

export type IpcErrorCode = 'ENOENT' | 'EACCES' | 'ENOTDIR' | 'EISDIR' | 'ECONFLICT' | 'UNKNOWN'

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: IpcErrorCode }

export interface RecentEntry {
  path: string
  time: number
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface DesktopAPI {
  openFileDialog(): Promise<IpcResult<FileOpenResult | null>>
  openPath(path: string): Promise<IpcResult<FileOpenResult>>
  takeStartupFile(): Promise<string | null>
  getPathForFile(file: unknown): string
  onOpenFileFromMain(cb: (path: string) => void): () => void
  onMenuOpenFile(cb: () => void): () => void
  openWorkspaceDialog(): Promise<IpcResult<string | null>>
  openWorkspace(path: string): Promise<IpcResult<string>>
  getWorkspace(): Promise<IpcResult<string | null>>
  onMenuOpenFolder(cb: () => void): () => void
  setThemeSource(theme: ColorScheme): void
  syncPrefs(prefs: PrefsState): void
  onMenuSetReading(cb: (patch: Partial<ReadingSettings>) => void): () => void
  onMenuSetTheme(cb: (theme: ColorScheme) => void): () => void
  onMenuSetPreset(cb: (preset: ThemePreset) => void): () => void
  openExternal(url: string): void
  listDir(path: string): Promise<IpcResult<DirEntry[]>>
  onFileChanged(cb: (path: string) => void): () => void
  onDirChanged(cb: (dir: string) => void): () => void
  readFileSnapshot(path: string): Promise<IpcResult<FileInfo>>
  saveFile(
    path: string,
    content: string,
    meta: SaveMeta,
    expectedMtime?: number
  ): Promise<IpcResult<FileInfo>>
  setDirty(dirty: boolean): void
  onMenuSaveFile(cb: () => void): () => void
  onMenuSetViewMode(cb: (mode: ViewMode) => void): () => void
  confirmDiscard(): Promise<'save' | 'discard' | 'cancel'>
  confirmOverwrite(): Promise<boolean>
  onRequestSaveAndClose(cb: () => void): () => void
  closeConfirmed(): void
}
