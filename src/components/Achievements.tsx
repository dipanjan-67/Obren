import React, { useMemo, useState } from 'react';
import {
  Award,
  BookOpenCheck,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Crown,
  Flame,
  Info,
  Lock,
  Medal,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Target,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { computeBadges, type AchievementBadge, type BadgeCategory, type BadgeTier } from '../lib/gamification';
import type { PublicProfile, StudySession, TestAttempt, UserProfile } from '../types/obren';

interface AchievementsProps {
  profile: UserProfile | PublicProfile;
  attempts?: TestAttempt[];
  sessions?: StudySession[];
  variant?: 'full' | 'compact' | 'profile' | 'badge-row';
  maxDisplay?: number;
  onBadgeClick?: (badge: AchievementBadge) => void;
  className?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Flame,
  CalendarCheck,
  Crown,
  Sunrise,
  Clock,
  ShieldCheck,
  Trophy,
  Target,
  BookOpenCheck,
  Sparkles,
  Medal,
  Zap,
};

const TIER_STYLES: Record<
  BadgeTier,
  {
    name: string;
    border: string;
    text: string;
    bg: string;
    gradient: string;
    glow: string;
  }
> = {
  BRONZE: {
    name: 'Bronze',
    border: 'border-amber-700/40 dark:border-amber-700/60',
    text: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-100/60 dark:bg-amber-950/40',
    gradient: 'from-amber-600/20 to-amber-800/10',
    glow: 'shadow-amber-500/10',
  },
  SILVER: {
    name: 'Silver',
    border: 'border-slate-300 dark:border-slate-600',
    text: 'text-slate-600 dark:text-slate-300',
    bg: 'bg-slate-100 dark:bg-slate-800',
    gradient: 'from-slate-400/20 to-slate-600/10',
    glow: 'shadow-slate-400/10',
  },
  GOLD: {
    name: 'Gold',
    border: 'border-yellow-400/60 dark:border-yellow-500/50',
    text: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-950/40',
    gradient: 'from-yellow-400/25 to-amber-500/15',
    glow: 'shadow-yellow-500/20',
  },
  DIAMOND: {
    name: 'Diamond',
    border: 'border-cyan-400/60 dark:border-cyan-400/40',
    text: 'text-cyan-600 dark:text-cyan-300',
    bg: 'bg-cyan-50 dark:bg-cyan-950/40',
    gradient: 'from-cyan-400/25 to-blue-500/15',
    glow: 'shadow-cyan-500/25',
  },
};

export const Achievements: React.FC<AchievementsProps> = ({
  profile,
  attempts,
  sessions,
  variant = 'full',
  maxDisplay,
  onBadgeClick,
  className = '',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | BadgeCategory>('ALL');
  const [activeModalBadge, setActiveModalBadge] = useState<AchievementBadge | null>(null);

  const badges = useMemo(() => {
    return computeBadges(profile, attempts, sessions);
  }, [profile, attempts, sessions]);

  const unlockedCount = useMemo(() => badges.filter((b) => b.unlocked).length, [badges]);

  const filteredBadges = useMemo(() => {
    let list = badges;
    if (selectedCategory !== 'ALL') {
      list = list.filter((b) => b.category === selectedCategory);
    }
    if (maxDisplay && maxDisplay > 0) {
      list = list.slice(0, maxDisplay);
    }
    return list;
  }, [badges, selectedCategory, maxDisplay]);

  const renderBadgeIcon = (iconName: string, className = 'w-5 h-5') => {
    const IconComp = ICON_MAP[iconName] || Trophy;
    return <IconComp className={className} />;
  };

  const handleCardClick = (badge: AchievementBadge) => {
    if (onBadgeClick) {
      onBadgeClick(badge);
    } else {
      setActiveModalBadge(badge);
    }
  };

  // 1. Leaderboard Table Row Variant
  if (variant === 'badge-row') {
    const unlocked = badges.filter((b) => b.unlocked);
    if (unlocked.length === 0) {
      return (
        <span className="text-xs text-slate-400 italic">
          No badges yet
        </span>
      );
    }
    return (
      <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
        {unlocked.slice(0, 2).map((b) => {
          const tier = TIER_STYLES[b.tier];
          return (
            <span
              key={b.id}
              title={`${b.name}: ${b.description}`}
              onClick={() => handleCardClick(b)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer hover:scale-105 transition-transform ${tier.bg} ${tier.border} ${tier.text}`}
            >
              {renderBadgeIcon(b.iconName, 'w-3 h-3')}
              <span className="truncate max-w-[85px]">{b.name}</span>
            </span>
          );
        })}
        {unlocked.length > 2 && (
          <button
            type="button"
            onClick={() => handleCardClick(unlocked[0])}
            className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 cursor-pointer"
            title={`${unlocked.length} total unlocked badges. Click to inspect.`}
          >
            +{unlocked.length - 2}
          </button>
        )}

        {/* Modal for inspect */}
        {activeModalBadge && (
          <BadgeDetailModal badge={activeModalBadge} onClose={() => setActiveModalBadge(null)} />
        )}
      </div>
    );
  }

  // 2. Compact View (e.g. for Dashboard card)
  if (variant === 'compact') {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            {unlockedCount} of {badges.length} Unlocked
          </span>
          <div className="w-32 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.round((unlockedCount / badges.length) * 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredBadges.slice(0, 6).map((b) => {
            const tier = TIER_STYLES[b.tier];
            return (
              <div
                key={b.id}
                onClick={() => handleCardClick(b)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer hover:border-indigo-400 flex items-start gap-3 ${
                  b.unlocked
                    ? `${tier.bg} ${tier.border} shadow-xs`
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    b.unlocked
                      ? `bg-white dark:bg-slate-900 ${tier.text} shadow-xs`
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  {renderBadgeIcon(b.iconName, 'w-4 h-4')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="font-bold text-xs truncate">{b.name}</h4>
                    {b.unlocked ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                    {b.requirement}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {activeModalBadge && (
          <BadgeDetailModal badge={activeModalBadge} onClose={() => setActiveModalBadge(null)} />
        )}
      </div>
    );
  }

  // 3. Profile & Full View (Detailed Grid with Filters & Progress Bars)
  return (
    <div className={`space-y-5 ${className}`}>
      {/* Category Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-indigo-500" />
          <span className="font-bold text-sm font-display">
            Badges & Milestones ({unlockedCount} / {badges.length} Unlocked)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ['ALL', 'All'],
            ['STREAK', 'Streaks'],
            ['STUDY_HOURS', 'Study Hours'],
            ['PERFORMANCE', 'Exam Performance'],
          ] as const).map(([cat, label]) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBadges.map((b) => {
          const tier = TIER_STYLES[b.tier];
          return (
            <div
              key={b.id}
              onClick={() => handleCardClick(b)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-indigo-400 flex flex-col justify-between gap-3 ${
                b.unlocked
                  ? `${tier.bg} ${tier.border} ${tier.glow} shadow-sm`
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-65 hover:opacity-90'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                    b.unlocked
                      ? `bg-white dark:bg-slate-900 ${tier.border} ${tier.text} shadow-sm`
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                  }`}
                >
                  {renderBadgeIcon(b.iconName, 'w-5 h-5')}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded-md ${tier.bg} ${tier.text}`}
                    >
                      {tier.name}
                    </span>
                    {b.unlocked ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Awarded</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                        <Lock className="w-3 h-3" />
                        <span>Locked</span>
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-sm font-display mt-1 text-slate-900 dark:text-white">
                    {b.name}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                    {b.description}
                  </p>
                </div>
              </div>

              {/* Requirement & Progress Bar */}
              <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/60 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
                    {b.requirement}
                  </span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {b.unlocked
                      ? '100%'
                      : `${b.currentValue} / ${b.targetValue}`}
                  </span>
                </div>

                <div className="w-full bg-slate-200/80 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      b.unlocked ? 'bg-emerald-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${b.progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {activeModalBadge && (
        <BadgeDetailModal badge={activeModalBadge} onClose={() => setActiveModalBadge(null)} />
      )}
    </div>
  );
};

interface BadgeDetailModalProps {
  badge: AchievementBadge;
  onClose: () => void;
}

const BadgeDetailModal: React.FC<BadgeDetailModalProps> = ({ badge, onClose }) => {
  const tier = TIER_STYLES[badge.tier];
  const IconComp = ICON_MAP[badge.iconName] || Trophy;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-3 pt-2">
          <div
            className={`w-20 h-20 rounded-3xl border-2 flex items-center justify-center ${
              badge.unlocked
                ? `${tier.bg} ${tier.border} ${tier.text} shadow-lg shadow-indigo-500/10`
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
            }`}
          >
            <IconComp className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <span
              className={`text-[11px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-md ${tier.bg} ${tier.text}`}
            >
              {tier.name} Tier · {badge.category.replace('_', ' ')}
            </span>
            <h3 className="text-xl font-extrabold font-display">{badge.name}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xs">
              {badge.description}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Unlock Requirement</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{badge.requirement}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Current Progress</span>
            <span className="font-mono font-bold">
              {badge.unlocked ? 'Completed' : `${badge.currentValue} / ${badge.targetValue} (${badge.progressPercent}%)`}
            </span>
          </div>

          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                badge.unlocked ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${badge.progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Info className="w-3.5 h-3.5 text-indigo-500" />
            <span>Badges boost your scholar rank in the Arena</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
