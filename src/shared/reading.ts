import type { FontFamilyKey, ReadingSettings } from './types'

export const READING_DEFAULTS: ReadingSettings = {
  fontSize: 15,
  fontFamily: 'default',
  lineHeight: 1.75,
  contentWidth: 860
}

export const FONT_SIZE_OPTIONS = [14, 15, 17, 19] as const

export const FONT_FAMILY_OPTIONS: readonly { value: FontFamilyKey; label: string }[] = [
  { value: 'default', label: '默认' },
  { value: 'serif', label: '宋体' },
  { value: 'kai', label: '楷体' }
]

export const LINE_HEIGHT_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1.5, label: '紧凑' },
  { value: 1.75, label: '标准' },
  { value: 2, label: '宽松' }
]

export const CONTENT_WIDTH_OPTIONS: readonly { value: number | null; label: string }[] = [
  { value: 680, label: '窄' },
  { value: 860, label: '标准' },
  { value: 1100, label: '宽' },
  { value: null, label: '全宽' }
]

const FONT_FAMILY_VALUES: readonly FontFamilyKey[] = FONT_FAMILY_OPTIONS.map((o) => o.value)
const LINE_HEIGHT_VALUES: readonly number[] = LINE_HEIGHT_OPTIONS.map((o) => o.value)
const CONTENT_WIDTH_VALUES: readonly (number | null)[] = CONTENT_WIDTH_OPTIONS.map((o) => o.value)

export const FONT_STACKS: Record<FontFamilyKey, string> = {
  default: "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', SimSun, 'Songti SC', 'Noto Serif SC', serif",
  kai: "KaiTi, 'STKaiti', 'Kaiti SC', '楷体', serif"
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** 逐字段校验，非法字段单独回退默认值 */
export function normalizeReading(raw: unknown): ReadingSettings {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<ReadingSettings>
  return {
    fontSize: pick(data.fontSize, FONT_SIZE_OPTIONS, READING_DEFAULTS.fontSize),
    fontFamily: pick(data.fontFamily, FONT_FAMILY_VALUES, READING_DEFAULTS.fontFamily),
    lineHeight: pick(data.lineHeight, LINE_HEIGHT_VALUES, READING_DEFAULTS.lineHeight),
    contentWidth: pick(data.contentWidth, CONTENT_WIDTH_VALUES, READING_DEFAULTS.contentWidth)
  }
}
