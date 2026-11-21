import { Menu } from 'electron'
import type { ColorScheme, PrefsState, ReadingSettings } from '../shared/types'
import {
  CONTENT_WIDTH_OPTIONS,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS
} from '../shared/reading'

interface MenuHandlers {
  openFile(): void
  openFolder(): void
  setReading(patch: Partial<ReadingSettings>): void
  setTheme(theme: ColorScheme): void
  prefs: PrefsState
}

export function buildMenu(handlers: MenuHandlers): void {
  const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])
  const { reading, theme } = handlers.prefs

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '打开文件…', accelerator: 'CmdOrCtrl+O', click: handlers.openFile },
        {
          label: '打开文件夹…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: handlers.openFolder
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '阅读设置',
          submenu: [
            {
              label: '字号',
              submenu: FONT_SIZE_OPTIONS.map((size) => ({
                label: String(size),
                type: 'radio',
                checked: reading.fontSize === size,
                click: () => handlers.setReading({ fontSize: size })
              }))
            },
            {
              label: '字体',
              submenu: FONT_FAMILY_OPTIONS.map((option) => ({
                label: option.label,
                type: 'radio',
                checked: reading.fontFamily === option.value,
                click: () => handlers.setReading({ fontFamily: option.value })
              }))
            },
            {
              label: '行距',
              submenu: LINE_HEIGHT_OPTIONS.map((option) => ({
                label: option.label,
                type: 'radio',
                checked: reading.lineHeight === option.value,
                click: () => handlers.setReading({ lineHeight: option.value })
              }))
            },
            {
              label: '宽度',
              submenu: CONTENT_WIDTH_OPTIONS.map((option) => ({
                label: option.label,
                type: 'radio',
                checked: reading.contentWidth === option.value,
                click: () => handlers.setReading({ contentWidth: option.value })
              }))
            }
          ]
        },
        {
          label: '主题',
          submenu: [
            {
              label: '深色',
              type: 'radio',
              checked: theme === 'dark',
              click: () => handlers.setTheme('dark')
            },
            {
              label: '浅色',
              type: 'radio',
              checked: theme === 'light',
              click: () => handlers.setTheme('light')
            }
          ]
        },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        ...(isDev
          ? ([{ role: 'toggleDevTools', label: '开发者工具' }, { type: 'separator' }] as Electron.MenuItemConstructorOptions[])
          : []),
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
