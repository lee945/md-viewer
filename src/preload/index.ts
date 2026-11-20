import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/ipc'
import type { ColorScheme, DesktopAPI, DirEntry, FileOpenResult, IpcResult } from '../shared/types'

function subscribe(channel: string, cb: (payload: string) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: string): void => cb(payload)
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
  openExternal: (url: string) => {
    ipcRenderer.send(IPC.openExternal, url)
  },
  listDir: (dirPath: string) => ipcRenderer.invoke(IPC.listDir, dirPath) as Promise<IpcResult<DirEntry[]>>
}

contextBridge.exposeInMainWorld('api', api)
