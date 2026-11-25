import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  ColorScheme,
  DesktopAPI,
  DirEntry,
  FileInfo,
  FileOpenResult,
  ImageSaveMode,
  IpcResult,
  ReadingSettings,
  SaveMeta,
  ViewMode
} from '../shared/types'
import type { ThemePreset } from '../shared/themes'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: DesktopAPI = {
  openFileDialog: () =>
    ipcRenderer.invoke(IPC.openDialog) as Promise<IpcResult<FileOpenResult | null>>,
  openPath: (filePath) => ipcRenderer.invoke(IPC.openPath, filePath) as Promise<IpcResult<FileOpenResult>>,
  takeStartupFile: () => ipcRenderer.invoke(IPC.takeStartupFile) as Promise<string | null>,
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file as File)
    } catch {
      return ''
    }
  },
  onOpenFileFromMain: (cb) => subscribe(IPC.openFileFromMain, cb),
  onMenuOpenFile: (cb) => subscribe(IPC.menuOpenFile, () => cb()),
  openWorkspaceDialog: () =>
    ipcRenderer.invoke(IPC.openWorkspaceDialog) as Promise<IpcResult<string | null>>,
  openWorkspace: (dirPath) =>
    ipcRenderer.invoke(IPC.openWorkspace, dirPath) as Promise<IpcResult<string>>,
  getWorkspace: () => ipcRenderer.invoke(IPC.getWorkspace) as Promise<IpcResult<string | null>>,
  onMenuOpenFolder: (cb) => subscribe(IPC.menuOpenFolder, () => cb()),
  setThemeSource: (theme: ColorScheme) => {
    ipcRenderer.send(IPC.setTheme, theme)
  },
  syncPrefs: (prefs) => {
    ipcRenderer.send(IPC.syncPrefs, prefs)
  },
  onMenuSetReading: (cb) => subscribe<Partial<ReadingSettings>>(IPC.menuSetReading, cb),
  onMenuSetTheme: (cb) => subscribe<ColorScheme>(IPC.menuSetTheme, cb),
  onMenuSetPreset: (cb) => subscribe<ThemePreset>(IPC.menuSetPreset, cb),
  openExternal: (url: string) => {
    ipcRenderer.send(IPC.openExternal, url)
  },
  listDir: (dirPath: string) => ipcRenderer.invoke(IPC.listDir, dirPath) as Promise<IpcResult<DirEntry[]>>,
  onFileChanged: (cb) => subscribe<string>(IPC.fileChanged, cb),
  onDirChanged: (cb) => subscribe<string>(IPC.dirChanged, cb),
  readFileSnapshot: (filePath: string) =>
    ipcRenderer.invoke(IPC.readFileSnapshot, filePath) as Promise<IpcResult<FileInfo>>,
  saveFile: (filePath: string, content: string, meta: SaveMeta, expectedMtime?: number) =>
    ipcRenderer.invoke(IPC.saveFile, filePath, content, meta, expectedMtime) as Promise<
      IpcResult<FileInfo>
    >,
  setDirty: (dirty: boolean) => {
    ipcRenderer.send(IPC.setDirty, dirty)
  },
  onMenuSaveFile: (cb) => subscribe(IPC.menuSaveFile, () => cb()),
  onMenuSetViewMode: (cb) => subscribe<ViewMode>(IPC.menuSetViewMode, cb),
  onMenuSetImageSaveMode: (cb) => subscribe<ImageSaveMode>(IPC.menuSetImageSaveMode, cb),
  confirmDiscard: () =>
    ipcRenderer.invoke(IPC.confirmDiscard) as Promise<'save' | 'discard' | 'cancel'>,
  confirmOverwrite: () => ipcRenderer.invoke(IPC.confirmOverwrite) as Promise<boolean>,
  onRequestSaveAndClose: (cb) => subscribe(IPC.requestSaveAndClose, () => cb()),
  closeConfirmed: () => {
    ipcRenderer.send(IPC.closeConfirmed)
  },
  copyImageToAssets: (srcPath: string, docPath: string) =>
    ipcRenderer.invoke(IPC.copyImageToAssets, srcPath, docPath) as Promise<IpcResult<string>>,
  saveImageBuffer: (data: Uint8Array, mime: string, docPath: string) =>
    ipcRenderer.invoke(IPC.saveImageBuffer, data, mime, docPath) as Promise<IpcResult<string>>
}

contextBridge.exposeInMainWorld('api', api)
