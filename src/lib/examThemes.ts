import {
  DEFAULT_EXAM_CUSTOMIZATION,
  type ExamAccentColor,
  type ExamCustomization,
  type ExamFontFamily,
  type ExamFontSize,
  type ExamLayoutDensity,
  type ExamLineSpacing,
  type ExamThemeId,
} from '../types/obren';

export interface ExamThemeTokens {
  id: ExamThemeId;
  label: string;
  description: string;
  isDark: boolean;
  pageBg: string;
  surfaceBg: string;
  subtleSurfaceBg: string;
  headerBg: string;
  headerText: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  optionBg: string;
  optionHoverBg: string;
  previewSwatch: string;
}

export const EXAM_THEMES: Record<ExamThemeId, ExamThemeTokens> = {
  DARK: {
    id: 'DARK',
    label: 'Dark Mode',
    description: 'Balanced charcoal slate for low-glare focus',
    isDark: true,
    pageBg: '#0b1120',
    surfaceBg: '#111827',
    subtleSurfaceBg: '#1e293b',
    headerBg: '#090d16',
    headerText: '#f8fafc',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    borderColor: '#1f2937',
    optionBg: '#151e30',
    optionHoverBg: '#1e293b',
    previewSwatch: '#111827',
  },
  LIGHT: {
    id: 'LIGHT',
    label: 'Light Mode',
    description: 'High-contrast crisp paper surface',
    isDark: false,
    pageBg: '#f1f5f9',
    surfaceBg: '#ffffff',
    subtleSurfaceBg: '#f8fafc',
    headerBg: '#0f172a',
    headerText: '#f8fafc',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    borderColor: '#e2e8f0',
    optionBg: '#ffffff',
    optionHoverBg: '#f8fafc',
    previewSwatch: '#ffffff',
  },
  MIDNIGHT_BLUE: {
    id: 'MIDNIGHT_BLUE',
    label: 'Midnight Blue',
    description: 'Deep navy cockpit palette for long exams',
    isDark: true,
    pageBg: '#061224',
    surfaceBg: '#0b1d36',
    subtleSurfaceBg: '#132a4a',
    headerBg: '#040c1a',
    headerText: '#e2e8f0',
    textPrimary: '#eaf2ff',
    textSecondary: '#93b4d8',
    borderColor: '#1e3a5f',
    optionBg: '#0f2442',
    optionHoverBg: '#17335c',
    previewSwatch: '#0b1d36',
  },
  AMOLED_BLACK: {
    id: 'AMOLED_BLACK',
    label: 'AMOLED Black',
    description: 'True #000000 OLED canvas with crisp borders',
    isDark: true,
    pageBg: '#000000',
    surfaceBg: '#09090b',
    subtleSurfaceBg: '#18181b',
    headerBg: '#000000',
    headerText: '#fafafa',
    textPrimary: '#fafafa',
    textSecondary: '#a1a1aa',
    borderColor: '#27272a',
    optionBg: '#0f0f12',
    optionHoverBg: '#18181b',
    previewSwatch: '#000000',
  },
  SOFT_GREY: {
    id: 'SOFT_GREY',
    label: 'Soft Grey',
    description: 'Neutral matte grey to soften screen brightness',
    isDark: false,
    pageBg: '#e5e7eb',
    surfaceBg: '#f3f4f6',
    subtleSurfaceBg: '#e5e7eb',
    headerBg: '#1f2937',
    headerText: '#f9fafb',
    textPrimary: '#111827',
    textSecondary: '#4b5563',
    borderColor: '#d1d5db',
    optionBg: '#f9fafb',
    optionHoverBg: '#eceef2',
    previewSwatch: '#e5e7eb',
  },
  EYE_COMFORT: {
    id: 'EYE_COMFORT',
    label: 'Eye Comfort',
    description: 'Warm sepia paper tint to reduce blue-light strain',
    isDark: false,
    pageBg: '#efe7d6',
    surfaceBg: '#faf4e6',
    subtleSurfaceBg: '#f2e9d5',
    headerBg: '#2c251b',
    headerText: '#faf4e6',
    textPrimary: '#2a2216',
    textSecondary: '#6b5b45',
    borderColor: '#dfd3bc',
    optionBg: '#fcf8ee',
    optionHoverBg: '#f3ebd8',
    previewSwatch: '#faf4e6',
  },
};

export interface AccentTokens {
  id: ExamAccentColor;
  label: string;
  primary: string;
  softBgDark: string;
  softBgLight: string;
  textOnAccent: string;
}

export const EXAM_ACCENTS: Record<ExamAccentColor, AccentTokens> = {
  INDIGO: {
    id: 'INDIGO',
    label: 'Indigo',
    primary: '#4f46e5',
    softBgDark: 'rgba(79, 70, 229, 0.2)',
    softBgLight: 'rgba(79, 70, 229, 0.1)',
    textOnAccent: '#ffffff',
  },
  EMERALD: {
    id: 'EMERALD',
    label: 'Emerald',
    primary: '#059669',
    softBgDark: 'rgba(5, 150, 105, 0.2)',
    softBgLight: 'rgba(5, 150, 105, 0.1)',
    textOnAccent: '#ffffff',
  },
  AMBER: {
    id: 'AMBER',
    label: 'Amber',
    primary: '#d97706',
    softBgDark: 'rgba(217, 119, 6, 0.22)',
    softBgLight: 'rgba(217, 119, 6, 0.12)',
    textOnAccent: '#ffffff',
  },
  CYAN: {
    id: 'CYAN',
    label: 'Cyan',
    primary: '#0891b2',
    softBgDark: 'rgba(8, 145, 178, 0.22)',
    softBgLight: 'rgba(8, 145, 178, 0.1)',
    textOnAccent: '#ffffff',
  },
  ROSE: {
    id: 'ROSE',
    label: 'Rose',
    primary: '#e11d48',
    softBgDark: 'rgba(225, 29, 72, 0.2)',
    softBgLight: 'rgba(225, 29, 72, 0.1)',
    textOnAccent: '#ffffff',
  },
};

export const EXAM_FONT_OPTIONS: Array<{ value: ExamFontFamily; label: string; css: string }> = [
  { value: 'Inter', label: 'Inter', css: '"Inter", system-ui, sans-serif' },
  { value: 'Roboto', label: 'Roboto', css: '"Roboto", system-ui, sans-serif' },
  { value: 'Poppins', label: 'Poppins', css: '"Poppins", system-ui, sans-serif' },
  { value: 'Open Sans', label: 'Open Sans', css: '"Open Sans", system-ui, sans-serif' },
  { value: 'Lato', label: 'Lato', css: '"Lato", system-ui, sans-serif' },
  { value: 'Arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { value: 'Georgia', label: 'Georgia (Serif)', css: 'Georgia, Cambria, serif' },
];

export function getFontCss(fontFamily: ExamFontFamily): string {
  return (
    EXAM_FONT_OPTIONS.find((f) => f.value === fontFamily)?.css ||
    '"Inter", system-ui, sans-serif'
  );
}

export function getFontSizePx(size: ExamFontSize, kind: 'BASE' | 'QUESTION' | 'OPTION'): string {
  const table: Record<'BASE' | 'QUESTION' | 'OPTION', Record<ExamFontSize, string>> = {
    BASE: { SMALL: '13px', MEDIUM: '15px', LARGE: '17px', XL: '19px' },
    QUESTION: { SMALL: '15px', MEDIUM: '17px', LARGE: '20px', XL: '23px' },
    OPTION: { SMALL: '14px', MEDIUM: '15.5px', LARGE: '17.5px', XL: '20px' },
  };
  return table[kind][size] || table[kind].MEDIUM;
}

export function getLineHeightValue(spacing: ExamLineSpacing): number {
  if (spacing === 'NORMAL') return 1.45;
  if (spacing === 'SPACIOUS') return 1.9;
  return 1.65;
}

export function getDensityPadding(density: ExamLayoutDensity): {
  questionPad: string;
  optionPad: string;
  optionGap: string;
} {
  if (density === 'COMPACT') {
    return { questionPad: '14px 18px', optionPad: '10px 14px', optionGap: '8px' };
  }
  return { questionPad: '24px 32px', optionPad: '14px 18px', optionGap: '12px' };
}

export function resolveExamCustomization(raw?: Partial<ExamCustomization> | null): ExamCustomization {
  return {
    fontFamily: raw?.fontFamily && EXAM_FONT_OPTIONS.some((f) => f.value === raw.fontFamily)
      ? raw.fontFamily
      : DEFAULT_EXAM_CUSTOMIZATION.fontFamily,
    fontSize: raw?.fontSize && ['SMALL', 'MEDIUM', 'LARGE', 'XL'].includes(raw.fontSize)
      ? raw.fontSize
      : DEFAULT_EXAM_CUSTOMIZATION.fontSize,
    theme: raw?.theme && raw.theme in EXAM_THEMES
      ? raw.theme
      : DEFAULT_EXAM_CUSTOMIZATION.theme,
    questionTextSize:
      raw?.questionTextSize && ['SMALL', 'MEDIUM', 'LARGE', 'XL'].includes(raw.questionTextSize)
        ? raw.questionTextSize
        : DEFAULT_EXAM_CUSTOMIZATION.questionTextSize,
    optionTextSize:
      raw?.optionTextSize && ['SMALL', 'MEDIUM', 'LARGE', 'XL'].includes(raw.optionTextSize)
        ? raw.optionTextSize
        : DEFAULT_EXAM_CUSTOMIZATION.optionTextSize,
    lineSpacing:
      raw?.lineSpacing && ['NORMAL', 'RELAXED', 'SPACIOUS'].includes(raw.lineSpacing)
        ? raw.lineSpacing
        : DEFAULT_EXAM_CUSTOMIZATION.lineSpacing,
    accentColor:
      raw?.accentColor && raw.accentColor in EXAM_ACCENTS
        ? raw.accentColor
        : DEFAULT_EXAM_CUSTOMIZATION.accentColor,
    layoutDensity:
      raw?.layoutDensity && ['COMFORTABLE', 'COMPACT'].includes(raw.layoutDensity)
        ? raw.layoutDensity
        : DEFAULT_EXAM_CUSTOMIZATION.layoutDensity,
  };
}
