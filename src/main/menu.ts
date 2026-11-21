import { Menu } from 'electron'
import type { ColorScheme, PrefsState, ReadingSettings, ViewMode } from '../shared/types'
import {
  CONTENT_WIDTH_OPTIONS,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS
} from '../shared/reading'
import { PRESET_OPTIONS, type ThemePreset } from '../shared/themes'

interface MenuHandlers {
  openFile(): void
  openFolder(): void
  saveFile(): void
  setReading(patch: Partial<ReadingSettings>): void
  setTheme(theme: ColorScheme): void
  setPreset(preset: ThemePreset): void
  setViewMode(mode: ViewMode): void
  prefs: PrefsState
}

const VIEW_MODE_OPTIONS: { value: ViewMode; label: string; accelerator: string }[] = [
  { value: 'read', label: '阅读', accelerator: 'CmdOrCtrl+1' },
  { value: 'edit', label: '单栏编辑', accelerator: 'CmdOrCtrl+2' },
  { value: 'split', label: '分栏', accelerator: 'CmdOrCtrl+3' }
]

export function buildMenu(handlers: MenuHandlers): void {
  const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])
  const { reading, theme, preset, viewMode } = handlers.prefs

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
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: handlers.saveFile },
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
          label: '显示模式',
          submenu: VIEW_MODE_OPTIONS.map((option) => ({
            label: option.label,
            type: 'radio',
            accelerator: option.accelerator,
            checked: viewMode === option.value,
            click: () => handlers.setViewMode(option.value)
          }))
        },
        { type: 'separator' },
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
              label: '风格',
              submenu: PRESET_OPTIONS.map((option) => ({
                label: option.label,
                type: 'radio',
                checked: preset === option.value,
                click: () => handlers.setPreset(option.value)
              }))
            },
            { type: 'separator' },
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
