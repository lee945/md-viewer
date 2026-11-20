import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/ipc'
import type { ColorScheme, DesktopAPI, DirEntry, FileInfo, IpcResult } from '../shared/types'

function subscribe(channel: string, cb: (payload: string) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: string): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: DesktopAPI = {
  openFileDialog: () => ipcRenderer.invoke(IPC.openDialog) as Promise<IpcResult<FileInfo | null>>,
  openPath: (filePath) => ipcRenderer.invoke(IPC.openPath, filePath) as Promise<IpcResult<FileInfo>>,
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
  setThemeSource: (theme: ColorScheme) => {
    ipcRenderer.send(IPC.setTheme, theme)
  },
  openExternal: (url: string) => {
    ipcRenderer.send(IPC.openExternal, url)
  },
  listDir: (dirPath: string) => ipcRenderer.invoke(IPC.listDir, dirPath) as Promise<IpcResult<DirEntry[]>>
}

contextBridge.exposeInMainWorld('api', api)
