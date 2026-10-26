import { Check } from 'lucide-react';
import { GlassSheet } from './Glass.jsx';
import { goalsFor, rollDaily, todayKey, GOAL_REWARD } from '../lib/daily.js';

export default function DailySheet({ profile, onClose }) {
  const daily = rollDaily(profile.daily, todayKey());
  const goals = goalsFor(daily.date);

  return (
    <GlassSheet title="Today" onClose={onClose}>
      <p className="mb-4 text-[15px] text-white/70">
        Three gentle intentions for today. Finish any, all, or none. Each one brings {GOAL_REWARD} sparks.
      </p>
      <ul className="space-y-2">
        {goals.map((g) => {
          const value = Math.min(daily.progress[g.type] || 0, g.target);
          const done = value >= g.target;
          return (
            <li key={g.id} className="rounded-action border border-white/15 bg-white/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[16px] font-medium">{g.label}</span>
                {done ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#34C759]" aria-label="Done">
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="shrink-0 text-[14px] tabular-nums text-white/60">{value}/{g.target}</span>
                )}
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={g.target}
                aria-valuenow={value}
                aria-label={g.label}
              >
                <div className="h-full rounded-full bg-lantern transition-all" style={{ width: `${(value / g.target) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-center text-[13px] text-white/50">New intentions arrive tomorrow. No streaks, no pressure.</p>
    </GlassSheet>
  );
}
