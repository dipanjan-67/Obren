import React, { useEffect, useState } from 'react';
import { Check, Eye, Palette, RotateCcw, Save, Sliders, Type } from 'lucide-react';
import {
  EXAM_ACCENTS,
  EXAM_FONT_OPTIONS,
  EXAM_THEMES,
  getDensityPadding,
  getFontCss,
  getFontSizePx,
  getLineHeightValue,
  resolveExamCustomization,
} from '../lib/examThemes';
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

interface ExamCustomizationPanelProps {
  value?: ExamCustomization | null;
  onSave: (customization: ExamCustomization) => Promise<void>;
}

const SIZE_LABELS: Array<{ value: ExamFontSize; label: string }> = [
  { value: 'SMALL', label: 'Small' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
  { value: 'XL', label: 'Extra Large' },
];

export const ExamCustomizationPanel: React.FC<ExamCustomizationPanelProps> = ({
  value,
  onSave,
}) => {
  const [draft, setDraft] = useState<ExamCustomization>(() => resolveExamCustomization(value));
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [previewSelectedOption, setPreviewSelectedOption] = useState<number>(1);

  useEffect(() => {
    setDraft(resolveExamCustomization(value));
  }, [value]);

  const themeTokens = EXAM_THEMES[draft.theme];
  const accentTokens = EXAM_ACCENTS[draft.accentColor];
  const densityTokens = getDensityPadding(draft.layoutDensity);
  const fontCss = getFontCss(draft.fontFamily);
  const lineHeight = getLineHeightValue(draft.lineSpacing);

  const handleSave = async () => {
    setSaving(true);
    setSavedNotice(null);
    try {
      await onSave(draft);
      setSavedNotice('Exam appearance saved to your profile and will load automatically on every test.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(DEFAULT_EXAM_CUSTOMIZATION);
    setSavedNotice(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold font-display tracking-tight">
            Exam Interface Customization
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Personalize fonts, text sizes, reading themes, accent highlights, and spacing for distraction-free exams.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Column */}
        <div className="lg:col-span-6 space-y-5">
          {/* Theme Picker */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold font-display">
              <Palette className="w-4 h-4 text-indigo-500" />
              <span>Exam Reading Theme</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {(Object.keys(EXAM_THEMES) as ExamThemeId[]).map((tId) => {
                const t = EXAM_THEMES[tId];
                const active = draft.theme === tId;
                return (
                  <button
                    key={tId}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, theme: tId }))}
                    className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      active
                        ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span
                        className="w-5 h-5 rounded-md border border-slate-400/40 shrink-0"
                        style={{ backgroundColor: t.previewSwatch }}
                      />
                      {active && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                    </div>
                    <div className="text-xs font-bold">{t.label}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                      {t.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Typography Controls */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold font-display">
              <Type className="w-4 h-4 text-indigo-500" />
              <span>Typography &amp; Sizing</span>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Font Family</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {EXAM_FONT_OPTIONS.map((font) => {
                  const active = draft.fontFamily === font.value;
                  return (
                    <button
                      key={font.value}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, fontFamily: font.value as ExamFontFamily }))
                      }
                      style={{ fontFamily: font.css }}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {font.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5">UI Font Size</label>
                <select
                  value={draft.fontSize}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, fontSize: e.target.value as ExamFontSize }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  {SIZE_LABELS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Question Text</label>
                <select
                  value={draft.questionTextSize}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      questionTextSize: e.target.value as ExamFontSize,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  {SIZE_LABELS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Option Text</label>
                <select
                  value={draft.optionTextSize}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      optionTextSize: e.target.value as ExamFontSize,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  {SIZE_LABELS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Spacing, Accent & Density */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold font-display">
              <Sliders className="w-4 h-4 text-indigo-500" />
              <span>Comfort &amp; Layout Options</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Line Spacing</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['NORMAL', 'RELAXED', 'SPACIOUS'] as ExamLineSpacing[]).map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, lineSpacing: sp }))}
                      className={`py-2 rounded-xl border text-[11px] font-semibold cursor-pointer ${
                        draft.lineSpacing === sp
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {sp.charAt(0) + sp.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Layout Density</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['COMFORTABLE', 'COMPACT'] as ExamLayoutDensity[]).map((dn) => (
                    <button
                      key={dn}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, layoutDensity: dn }))}
                      className={`py-2 rounded-xl border text-[11px] font-semibold cursor-pointer ${
                        draft.layoutDensity === dn
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {dn.charAt(0) + dn.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Accent Color Highlight</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(EXAM_ACCENTS) as ExamAccentColor[]).map((accKey) => {
                  const acc = EXAM_ACCENTS[accKey];
                  const active = draft.accentColor === accKey;
                  return (
                    <button
                      key={accKey}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, accentColor: accKey }))}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                        active
                          ? 'border-slate-900 dark:border-white ring-2 ring-indigo-500/30'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: acc.primary }}
                      />
                      <span>{acc.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Panel */}
        <div className="lg:col-span-6">
          <div className="sticky top-20 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-500" />
                <span>Live Examination Preview</span>
              </span>
              <span className="font-mono">
                {draft.fontFamily} · {themeTokens.label}
              </span>
            </div>

            <div
              className="rounded-2xl overflow-hidden border shadow-xl transition-colors duration-200"
              style={{
                backgroundColor: themeTokens.pageBg,
                color: themeTokens.textPrimary,
                borderColor: themeTokens.borderColor,
                fontFamily: fontCss,
                fontSize: getFontSizePx(draft.fontSize, 'BASE'),
              }}
            >
              {/* Mock Exam Header */}
              <div
                className="px-4 py-3 flex items-center justify-between border-b"
                style={{
                  backgroundColor: themeTokens.headerBg,
                  color: themeTokens.headerText,
                  borderColor: themeTokens.borderColor,
                }}
              >
                <div className="font-bold text-xs tracking-wide">
                  OBREN CBT · JEE Main Mock
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span
                    className="px-2 py-0.5 rounded font-bold"
                    style={{ backgroundColor: accentTokens.primary, color: accentTokens.textOnAccent }}
                  >
                    01:44:20
                  </span>
                </div>
              </div>

              {/* Mock Question Body */}
              <div
                style={{
                  backgroundColor: themeTokens.surfaceBg,
                  padding: densityTokens.questionPad,
                }}
              >
                <div
                  className="text-xs font-semibold mb-3 flex items-center justify-between"
                  style={{ color: themeTokens.textSecondary }}
                >
                  <span>Question 14 / 30 · Physics (Rotational Motion)</span>
                  <span style={{ color: accentTokens.primary }}>+4 / -1</span>
                </div>

                <p
                  className="font-medium mb-4"
                  style={{
                    fontSize: getFontSizePx(draft.questionTextSize, 'QUESTION'),
                    lineHeight,
                  }}
                >
                  A solid uniform sphere of mass M and radius R rolls without slipping down an inclined plane of inclination 30°. What is the acceleration of its center of mass?
                </p>

                <div className="flex flex-col" style={{ gap: densityTokens.optionGap }}>
                  {[
                    '(5/14) g',
                    '(5/7) g sin 30°',
                    '(2/5) g',
                    '(1/3) g',
                  ].map((opt, idx) => {
                    const selected = previewSelectedOption === idx;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setPreviewSelectedOption(idx)}
                        className="w-full text-left rounded-xl border flex items-center gap-3 transition-colors cursor-pointer"
                        style={{
                          padding: densityTokens.optionPad,
                          backgroundColor: selected
                            ? themeTokens.isDark
                              ? accentTokens.softBgDark
                              : accentTokens.softBgLight
                            : themeTokens.optionBg,
                          borderColor: selected ? accentTokens.primary : themeTokens.borderColor,
                          color: themeTokens.textPrimary,
                          fontSize: getFontSizePx(draft.optionTextSize, 'OPTION'),
                          lineHeight,
                        }}
                      >
                        <span
                          className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono font-bold shrink-0"
                          style={{
                            backgroundColor: selected ? accentTokens.primary : themeTokens.subtleSurfaceBg,
                            color: selected ? accentTokens.textOnAccent : themeTokens.textSecondary,
                          }}
                        >
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className="mt-5 pt-3 border-t flex items-center justify-between text-xs"
                  style={{ borderColor: themeTokens.borderColor }}
                >
                  <span style={{ color: themeTokens.textSecondary }}>Answered: 14 of 30</span>
                  <span
                    className="px-3 py-1.5 rounded-lg font-semibold"
                    style={{
                      backgroundColor: accentTokens.primary,
                      color: accentTokens.textOnAccent,
                    }}
                  >
                    Save &amp; Next
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
