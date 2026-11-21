import { describe, expect, it } from 'vitest'
import { normalizePreset, paletteToVars, PRESET_OPTIONS, THEMES } from '@shared/themes'

const PALETTE_KEYS = [
  'bg',
  'bgElevated',
  'bgHover',
  'text',
  'textMuted',
  'border',
  'accent',
  'accentText',
  'codeBg',
  'shadow',
  'scrollbarThumb',
  'scrollbarThumbHover',
  'danger'
] as const

describe('normalizePreset', () => {
  it('接受合法预设', () => {
    expect(normalizePreset('github')).toBe('github')
    expect(normalizePreset('typora')).toBe('typora')
    expect(normalizePreset('obsidian')).toBe('obsidian')
  })

  it('非法值回退 github', () => {
    expect(normalizePreset('nope')).toBe('github')
    expect(normalizePreset('')).toBe('github')
    expect(normalizePreset(null)).toBe('github')
    expect(normalizePreset(42)).toBe('github')
    expect(normalizePreset(undefined)).toBe('github')
  })
})

describe('THEMES', () => {
  it('每个预设都提供完整深浅调色板与高亮主题', () => {
    for (const { value } of PRESET_OPTIONS) {
      const theme = THEMES[value]
      expect(theme.name).toBe(value)
      for (const scheme of ['light', 'dark'] as const) {
        const palette = theme.scheme[scheme]
        for (const key of PALETTE_KEYS) {
          expect(palette[key], `${value}/${scheme}/${key}`).toBeTruthy()
        }
        expect(theme.shiki[scheme]).toBeTruthy()
      }
    }
  })

  it('每个预设的代码高亮主题都区分明暗', () => {
    for (const { value } of PRESET_OPTIONS) {
      expect(THEMES[value].shiki.light).not.toBe(THEMES[value].shiki.dark)
    }
  })
})

describe('paletteToVars', () => {
  it('键映射为与样式表一致的 CSS 变量名', () => {
    const vars = paletteToVars(THEMES.github.scheme.light)
    const expected = PALETTE_KEYS.map(
      (key) => `--${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`
    )
    expect(Object.keys(vars).sort()).toEqual(expected.sort())
  })

  it('值与调色板一致', () => {
    const vars = paletteToVars(THEMES.obsidian.scheme.dark)
    expect(vars['--bg']).toBe('#1e1f22')
    expect(vars['--bg-elevated']).toBe('#26272b')
    expect(vars['--accent']).toBe('#8b7cf6')
  })
})
