import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IPC } from '../shared/ipc'
import type {
  ColorScheme,
  FileOpenResult,
  IpcErrorCode,
  IpcResult,
  PrefsState,
  SaveMeta,
  ViewMode
} from '../shared/types'
import { normalizeReading, READING_DEFAULTS } from '../shared/reading'
import { normalizePreset } from '../shared/themes'
import { buildMenu } from './menu'
import { registerAssetProtocol } from './services/assets'
import { findMarkdownArg } from './services/argv'
import { listDirectory } from './services/dir'
import { readMarkdownFile, writeMarkdownFile } from './services/text'
import { DirWatchers, FileWatcher, type WatchFactory } from './services/watcher'
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
let currentFilePath: string | null = null
let rendererDirty = false
let allowClose = false

/** 渲染进程同步过来的偏好，仅用于菜单选中态 */
let prefs: PrefsState = {
  reading: { ...READING_DEFAULTS },
  theme: 'dark',
  preset: 'github',
  viewMode: 'ir'
}

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])

const watchFactory: WatchFactory = (target, onChange) => {
  try {
    const watcher = fs.watch(target, { persistent: false }, () => onChange())
    watcher.on('error', () => watcher.close())
    return { close: () => watcher.close() }
  } catch {
    return { close: () => undefined }
  }
}

const dirWatchers = new DirWatchers(watchFactory, (dir) => {
  mainWindow?.webContents.send(IPC.dirChanged, dir)
})
const fileWatcher = new FileWatcher(watchFactory, (path) => {
  mainWindow?.webContents.send(IPC.fileChanged, path)
})

function setWorkspaceRoot(root: string | null): void {
  applyWorkspace(root)
  // 换工作区后旧目录监听全部作废，新目录随 listDir 重新注册
  dirWatchers.clear()
}

function isAppUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return url.startsWith(devUrl)
  return url.startsWith('file://')
}

function isTrusted(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  return isAppUrl(event.senderFrame?.url ?? '')
}

function updateTitle(): void {
  if (!mainWindow) return
  const root = getWorkspaceRoot()
  const name = currentFilePath ? path.basename(currentFilePath) : root ? path.basename(root) : null
  const prefix = rendererDirty ? '● ' : ''
  mainWindow.setTitle(name ? `${prefix}${name} — MD Viewer` : 'MD Viewer')
}

async function promptUnsavedClose(): Promise<void> {
  if (!mainWindow) return
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '未保存的修改',
    message: '当前文件有未保存的修改。',
    detail: '关闭窗口前是否保存？',
    buttons: ['保存并退出', '不保存', '取消'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })
  if (response === 2 || !mainWindow) return
  if (response === 1) {
    allowClose = true
    mainWindow.close()
    return
  }
  mainWindow.webContents.send(IPC.requestSaveAndClose)
}

function refreshMenu(): void {
  buildMenu({
    openFile: () => mainWindow?.webContents.send(IPC.menuOpenFile),
    openFolder: () => mainWindow?.webContents.send(IPC.menuOpenFolder),
    saveFile: () => mainWindow?.webContents.send(IPC.menuSaveFile),
    setReading: (patch) => mainWindow?.webContents.send(IPC.menuSetReading, patch),
    setTheme: (theme) => mainWindow?.webContents.send(IPC.menuSetTheme, theme),
    setPreset: (preset) => mainWindow?.webContents.send(IPC.menuSetPreset, preset),
    setViewMode: (mode) => mainWindow?.webContents.send(IPC.menuSetViewMode, mode),
    prefs
  })
}

function errorCode(err: unknown): IpcErrorCode {
  const code = (err as NodeJS.ErrnoException | null)?.code
  if (
    code === 'ENOENT' ||
    code === 'EACCES' ||
    code === 'ENOTDIR' ||
    code === 'EISDIR' ||
    code === 'ECONFLICT'
  ) {
    return code
  }
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
    if (!isInsideWorkspace(info.path)) setWorkspaceRoot(path.dirname(info.path))
    const workspaceRoot = getWorkspaceRoot() ?? path.dirname(info.path)
    fileWatcher.set(info.path)
    currentFilePath = info.path
    rendererDirty = false
    updateTitle()
    return { ok: true, data: { file: info, workspaceRoot } }
  } catch (err) {
    return errorResult(err)
  }
}

async function applyWorkspacePath(dirPath: string): Promise<IpcResult<string>> {
  try {
    const root = await resolveExistingDir(dirPath)
    setWorkspaceRoot(root)
    currentFilePath = null
    rendererDirty = false
    updateTitle()
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

  mainWindow.on('close', (event) => {
    if (allowClose || !rendererDirty) return
    event.preventDefault()
    void promptUnsavedClose()
  })

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
      const entries = await listDirectory(root, dirPath)
      dirWatchers.add(path.resolve(dirPath))
      return { ok: true, data: entries }
    } catch (err) {
      return errorResult(err)
    }
  })

  ipcMain.handle(IPC.readFileSnapshot, async (event, filePath: unknown) => {
    if (!isTrusted(event)) return { ok: false, error: '未授权的调用来源' }
    if (typeof filePath !== 'string' || filePath.length === 0 || filePath.includes('\0')) {
      return { ok: false, error: '无效的文件路径' }
    }
    if (!isInsideWorkspace(filePath)) return { ok: false, error: '文件不在工作区内' }
    try {
      return { ok: true, data: await readMarkdownFile(filePath) }
    } catch (err) {
      return errorResult(err)
    }
  })

  ipcMain.handle(
    IPC.saveFile,
    async (event, filePath: unknown, content: unknown, meta: unknown, expectedMtime: unknown) => {
      if (!isTrusted(event)) return { ok: false, error: '未授权的调用来源' }
      if (typeof filePath !== 'string' || filePath.length === 0 || filePath.includes('\0')) {
        return { ok: false, error: '无效的文件路径' }
      }
      if (typeof content !== 'string') return { ok: false, error: '无效的文件内容' }
      if (!isInsideWorkspace(filePath)) return { ok: false, error: '文件不在工作区内' }
      const m = (typeof meta === 'object' && meta !== null ? meta : null) as Partial<SaveMeta> | null
      if (
        !m ||
        typeof m.encoding !== 'string' ||
        typeof m.hasBOM !== 'boolean' ||
        (m.lineEnding !== 'LF' && m.lineEnding !== 'CRLF')
      ) {
        return { ok: false, error: '无效的保存参数' }
      }
      try {
        const info = await writeMarkdownFile(
          filePath,
          content,
          { encoding: m.encoding, hasBOM: m.hasBOM, lineEnding: m.lineEnding },
          typeof expectedMtime === 'number' ? expectedMtime : undefined
        )
        // rename 后旧监听可能失效，重新挂载
        fileWatcher.set(info.path)
        return { ok: true, data: info }
      } catch (err) {
        return errorResult(err)
      }
    }
  )

  ipcMain.on(IPC.setDirty, (event, dirty: unknown) => {
    if (!isTrusted(event)) return
    rendererDirty = Boolean(dirty)
    updateTitle()
  })

  ipcMain.handle(IPC.confirmDiscard, async (event) => {
    if (!isTrusted(event)) return 'cancel'
    const win = BrowserWindow.fromWebContents(event.sender)
    const { response } = await dialog.showMessageBox(win ?? mainWindow!, {
      type: 'warning',
      title: '未保存的修改',
      message: '当前文件有未保存的修改。',
      detail: '继续操作前是否保存？',
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    return response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel'
  })

  ipcMain.handle(IPC.confirmOverwrite, async (event) => {
    if (!isTrusted(event)) return false
    const win = BrowserWindow.fromWebContents(event.sender)
    const { response } = await dialog.showMessageBox(win ?? mainWindow!, {
      type: 'warning',
      title: '文件冲突',
      message: '文件已在外部被修改。',
      detail: '覆盖磁盘上的外部修改吗？此操作不可撤销。',
      buttons: ['覆盖', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    return response === 0
  })

  ipcMain.on(IPC.closeConfirmed, (event) => {
    if (!isTrusted(event)) return
    allowClose = true
    mainWindow?.close()
  })

  ipcMain.on(IPC.setTheme, (_event, theme: ColorScheme) => {
    nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
  })

  ipcMain.on(IPC.syncPrefs, (event, value: unknown) => {
    if (!isTrusted(event)) return
    const data = (typeof value === 'object' && value !== null ? value : {}) as Partial<PrefsState>
    const viewMode: ViewMode =
      data.viewMode === 'wysiwyg' || data.viewMode === 'split' ? data.viewMode : 'ir'
    prefs = {
      reading: normalizeReading(data.reading),
      theme: data.theme === 'light' ? 'light' : 'dark',
      preset: normalizePreset(data.preset),
      viewMode
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

  app.on('before-quit', () => {
    dirWatchers.clear()
    fileWatcher.clear()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
