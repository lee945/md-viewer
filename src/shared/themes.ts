import type { ColorScheme } from './types'

export type ThemePreset = 'github' | 'typora' | 'obsidian'

export interface ThemePalette {
  bg: string
  bgElevated: string
  bgHover: string
  text: string
  textMuted: string
  border: string
  accent: string
  accentText: string
  codeBg: string
  shadow: string
  scrollbarThumb: string
  scrollbarThumbHover: string
  danger: string
}

export interface MarkdownTheme {
  name: ThemePreset
  label: string
  scheme: Record<ColorScheme, ThemePalette>
  /** 与界面明暗保持一致的 Shiki 代码高亮主题 */
  shiki: Record<ColorScheme, string>
}

export const THEMES: Record<ThemePreset, MarkdownTheme> = {
  github: {
    name: 'github',
    label: 'GitHub',
    scheme: {
      light: {
        bg: '#f5f6f8',
        bgElevated: '#eceef2',
        bgHover: '#e1e5ea',
        text: '#1f2328',
        textMuted: '#59636e',
        border: '#d1d9e0',
        accent: '#0969da',
        accentText: '#ffffff',
        codeBg: '#eceff3',
        shadow: '0 8px 24px rgba(31, 35, 40, 0.12)',
        scrollbarThumb: 'rgba(89, 99, 110, 0.35)',
        scrollbarThumbHover: 'rgba(89, 99, 110, 0.6)',
        danger: '#d1242f'
      },
      dark: {
        bg: '#22272e',
        bgElevated: '#2d333b',
        bgHover: '#373e47',
        text: '#adbac7',
        textMuted: '#768390',
        border: '#444c56',
        accent: '#539bf5',
        accentText: '#ffffff',
        codeBg: '#2d333b',
        shadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        scrollbarThumb: 'rgba(173, 186, 199, 0.22)',
        scrollbarThumbHover: 'rgba(173, 186, 199, 0.4)',
        danger: '#f85149'
      }
    },
    shiki: { light: 'github-light', dark: 'github-dark-dimmed' }
  },
  typora: {
    name: 'typora',
    label: 'Typora',
    scheme: {
      light: {
        bg: '#f8f8f7',
        bgElevated: '#efeeec',
        bgHover: '#e7e6e3',
        text: '#333333',
        textMuted: '#777777',
        border: '#dedcd8',
        accent: '#4a89dc',
        accentText: '#ffffff',
        codeBg: '#f0efec',
        shadow: '0 8px 24px rgba(40, 40, 40, 0.12)',
        scrollbarThumb: 'rgba(70, 70, 70, 0.3)',
        scrollbarThumbHover: 'rgba(70, 70, 70, 0.55)',
        danger: '#e05252'
      },
      dark: {
        bg: '#2b2b2b',
        bgElevated: '#333333',
        bgHover: '#3d3d3d',
        text: '#d7d7d7',
        textMuted: '#9a9a9a',
        border: '#464646',
        accent: '#5aa9e6',
        accentText: '#ffffff',
        codeBg: '#333333',
        shadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
        scrollbarThumb: 'rgba(220, 220, 220, 0.2)',
        scrollbarThumbHover: 'rgba(220, 220, 220, 0.38)',
        danger: '#f07171'
      }
    },
    shiki: { light: 'one-light', dark: 'one-dark-pro' }
  },
  obsidian: {
    name: 'obsidian',
    label: 'Obsidian',
    scheme: {
      light: {
        bg: '#f7f6f9',
        bgElevated: '#efedf3',
        bgHover: '#e6e3ee',
        text: '#2e3338',
        textMuted: '#6b6f76',
        border: '#dedbe4',
        accent: '#7f6df2',
        accentText: '#ffffff',
        codeBg: '#efedf3',
        shadow: '0 8px 24px rgba(40, 30, 80, 0.12)',
        scrollbarThumb: 'rgba(90, 85, 110, 0.3)',
        scrollbarThumbHover: 'rgba(90, 85, 110, 0.55)',
        danger: '#d64545'
      },
      dark: {
        bg: '#1e1f22',
        bgElevated: '#26272b',
        bgHover: '#303136',
        text: '#dcddde',
        textMuted: '#999aa0',
        border: '#3a3b40',
        accent: '#8b7cf6',
        accentText: '#ffffff',
        codeBg: '#26272b',
        shadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        scrollbarThumb: 'rgba(200, 200, 210, 0.2)',
        scrollbarThumbHover: 'rgba(200, 200, 210, 0.38)',
        danger: '#ef5350'
      }
    },
    shiki: { light: 'catppuccin-latte', dark: 'catppuccin-mocha' }
  }
}

export const PRESET_OPTIONS: { value: ThemePreset; label: string }[] = [
  { value: 'github', label: 'GitHub' },
  { value: 'typora', label: 'Typora' },
  { value: 'obsidian', label: 'Obsidian' }
]

export function normalizePreset(raw: unknown): ThemePreset {
  return raw === 'typora' || raw === 'obsidian' || raw === 'github' ? raw : 'github'
}

/** palette 键（camelCase）→ CSS 变量名（--kebab-case） */
export function paletteToVars(palette: ThemePalette): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(palette)) {
    const name = `--${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`
    vars[name] = value
  }
  return vars
}
