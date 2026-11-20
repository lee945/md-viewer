import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, shell } from 'electron'
import path from 'node:path'
import { IPC } from '../shared/ipc'
import type { ColorScheme, FileInfo, IpcResult } from '../shared/types'
import { buildMenu } from './menu'
import { registerAssetProtocol, setAssetRoot } from './services/assets'
import { findMarkdownArg } from './services/argv'
import { listDirectory } from './services/dir'
import { readMarkdownFile } from './services/text'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'md-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

let mainWindow: BrowserWindow | null = null
let startupFile: string | null = null
let rendererReady = false
let pendingPath: string | null = null
let workspaceRoot: string | null = null

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])

function isAppUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return url.startsWith(devUrl)
  return url.startsWith('file://')
}

function isTrusted(event: Electron.IpcMainInvokeEvent): boolean {
  return isAppUrl(event.senderFrame?.url ?? '')
}

async function openFileByPath(filePath: string): Promise<IpcResult<FileInfo>> {
  try {
    const info = await readMarkdownFile(filePath)
    workspaceRoot = path.dirname(info.path)
    setAssetRoot(workspaceRoot)
    mainWindow?.setTitle(`${path.basename(info.path)} — MD Viewer`)
    return { ok: true, data: info }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function flushPending(): void {
  if (!pendingPath || !rendererReady || !mainWindow) return
  mainWindow.webContents.send(IPC.openFileFromMain, pendingPath)
  pendingPath = null
}

function sendOpen(filePath: string): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  if (rendererReady) {
    mainWindow.webContents.send(IPC.openFileFromMain, filePath)
  } else {
    pendingPath = filePath
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#22272e',
    title: 'MD Viewer',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: isDev
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    rendererReady = false
  })

  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true
    flushPending()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.openDialog, async (event) => {
    if (!isTrusted(event)) return { ok: false, error: '未授权的调用来源' }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? mainWindow!, {
      title: '打开 Markdown 文件',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: true, data: null }
    return openFileByPath(result.filePaths[0])
  })

  ipcMain.handle(IPC.openPath, async (event, filePath: unknown) => {
    if (!isTrusted(event)) return { ok: false, error: '未授权的调用来源' }
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return { ok: false, error: '无效的文件路径' }
    }
    return openFileByPath(filePath)
  })

  ipcMain.handle(IPC.takeStartupFile, () => {
    const file = startupFile
    startupFile = null
    return file
  })

  ipcMain.handle(IPC.listDir, async (event, dirPath: unknown) => {
    if (!isTrusted(event)) return { ok: false, error: '未授权的调用来源' }
    if (typeof dirPath !== 'string' || dirPath.length === 0) {
      return { ok: false, error: '无效的目录路径' }
    }
    if (!workspaceRoot) return { ok: false, error: '尚未打开文档' }
    try {
      return { ok: true, data: await listDirectory(workspaceRoot, dirPath) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.on(IPC.setTheme, (_event, theme: ColorScheme) => {
    nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
  })

  ipcMain.on(IPC.openExternal, (_event, url: unknown) => {
    if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) {
      void shell.openExternal(url)
    }
  })
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const target = findMarkdownArg(argv)
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    if (target) sendOpen(target)
  })

  app.whenReady().then(() => {
    startupFile = findMarkdownArg(process.argv)
    registerAssetProtocol()
    registerIpc()
    buildMenu(() => mainWindow?.webContents.send(IPC.menuOpenFile))
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
