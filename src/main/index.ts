import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, shell } from 'electron'
import path from 'node:path'
import { IPC } from '../shared/ipc'
import type { ColorScheme, FileOpenResult, IpcErrorCode, IpcResult, PrefsState } from '../shared/types'
import { normalizeReading, READING_DEFAULTS } from '../shared/reading'
import { normalizePreset } from '../shared/themes'
import { buildMenu } from './menu'
import { registerAssetProtocol } from './services/assets'
import { findMarkdownArg } from './services/argv'
import { listDirectory } from './services/dir'
import { readMarkdownFile } from './services/text'
import {
  applyWorkspace,
  getWorkspaceRoot,
  isInsideWorkspace,
  resolveExistingDir
} from './services/workspace'

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

/** 渲染进程同步过来的偏好，仅用于菜单选中态 */
let prefs: PrefsState = {
  reading: { ...READING_DEFAULTS },
  theme: 'dark',
  preset: 'github'
}

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])

function isAppUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return url.startsWith(devUrl)
  return url.startsWith('file://')
}

function isTrusted(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  return isAppUrl(event.senderFrame?.url ?? '')
}

function refreshMenu(): void {
  buildMenu({
    openFile: () => mainWindow?.webContents.send(IPC.menuOpenFile),
    openFolder: () => mainWindow?.webContents.send(IPC.menuOpenFolder),
    setReading: (patch) => mainWindow?.webContents.send(IPC.menuSetReading, patch),
    setTheme: (theme) => mainWindow?.webContents.send(IPC.menuSetTheme, theme),
    setPreset: (preset) => mainWindow?.webContents.send(IPC.menuSetPreset, preset),
    prefs
  })
}

function errorCode(err: unknown): IpcErrorCode {
  const code = (err as NodeJS.ErrnoException | null)?.code
  if (code === 'ENOENT' || code === 'EACCES' || code === 'ENOTDIR' || code === 'EISDIR') return code
  return 'UNKNOWN'
}

function errorResult(err: unknown): IpcResult<never> {
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    code: errorCode(err)
  }
}

async function openFileByPath(filePath: string): Promise<IpcResult<FileOpenResult>> {
  try {
    const info = await readMarkdownFile(filePath)
    // 核心不变量：当前文件永远在工作区内；越界时把根切到文件所在目录
    if (!isInsideWorkspace(info.path)) applyWorkspace(path.dirname(info.path))
    const workspaceRoot = getWorkspaceRoot() ?? path.dirname(info.path)
    mainWindow?.setTitle(`${path.basename(info.path)} — MD Viewer`)
    return { ok: true, data: { file: info, workspaceRoot } }
  } catch (err) {
    return errorResult(err)
  }
}

async function applyWorkspacePath(dirPath: string): Promise<IpcResult<string>> {
  try {
    const root = await resolveExistingDir(dirPath)
    applyWorkspace(root)
    mainWindow?.setTitle(`${path.basename(root)} — MD Viewer`)
    return { ok: true, data: root }
  } catch (err) {
    return errorResult(err)
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

  ipcMain.handle(IPC.openWorkspaceDialog, async (event) => {
    if (!isTrusted(event)) return { ok: false, error: '未授权的调用来源' }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? mainWindow!, {
      title: '打开文件夹作为工作区',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: true, data: null }
    return applyWorkspacePath(result.filePaths[0])
  })

  ipcMain.handle(IPC.openWorkspace, async (event, dirPath: unknown) => {
    if (!isTrusted(event)) return { ok: false, error: '未授权的调用来源' }
    if (typeof dirPath !== 'string' || dirPath.length === 0 || dirPath.includes('\0')) {
      return { ok: false, error: '无效的文件夹路径' }
    }
    return applyWorkspacePath(dirPath)
  })

  ipcMain.handle(IPC.getWorkspace, (event) => {
    if (!isTrusted(event)) return { ok: false, error: '未授权的调用来源' }
    return { ok: true, data: getWorkspaceRoot() }
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
    const root = getWorkspaceRoot()
    if (!root) return { ok: false, error: '尚未打开工作区' }
    try {
      return { ok: true, data: await listDirectory(root, dirPath) }
    } catch (err) {
      return errorResult(err)
    }
  })

  ipcMain.on(IPC.setTheme, (_event, theme: ColorScheme) => {
    nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
  })

  ipcMain.on(IPC.syncPrefs, (event, value: unknown) => {
    if (!isTrusted(event)) return
    const data = (typeof value === 'object' && value !== null ? value : {}) as Partial<PrefsState>
    prefs = {
      reading: normalizeReading(data.reading),
      theme: data.theme === 'light' ? 'light' : 'dark',
      preset: normalizePreset(data.preset)
    }
    refreshMenu()
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
    refreshMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
