import { Sparkles, Sprout, Flower2, TreeDeciduous, Flower, Leaf, Gem, Lock } from 'lucide-react';
import { GlassSheet } from './Glass.jsx';
import { FLORA, isUnlocked } from '../lib/flora.js';

const ICONS = { fern: Sprout, bloom: Flower2, tree: TreeDeciduous, lotus: Flower, willow: Leaf, crystal: Gem };

export default function SanctuarySheet({ profile, onSelect, onClose }) {
  const total = FLORA.reduce((n, f) => n + (profile.garden[f.id] || 0), 0);
  const sprouts = FLORA.flatMap((f) => Array.from({ length: Math.min(profile.garden[f.id] || 0, 12) }, (_, i) => ({ f, key: `${f.id}${i}` })));

  return (
    <GlassSheet title="Sanctuary" onClose={onClose}>
      <p className="mb-4 text-[15px] text-white/70">
        Pick a seed, close this sheet, then <strong className="font-semibold text-white">tap a floating island</strong> as it drifts by. Your garden waits for you on the Home Isle.
      </p>

      <div
        className="relative mb-4 flex min-h-[96px] flex-wrap content-end items-end gap-1 overflow-hidden rounded-action border border-white/15 bg-white/5 p-3"
        aria-label={`Your garden has ${total} plants`}
      >
        {sprouts.length === 0 && <p className="m-auto text-[14px] text-white/50">Your garden is waiting for its first seed.</p>}
        {sprouts.map(({ f, key }, i) => {
          const Icon = ICONS[f.id];
          return (
            <Icon
              key={key}
              size={22 + (i % 3) * 4}
              color={f.color}
              style={{ filter: `drop-shadow(0 0 8px ${f.glow})` }}
              aria-hidden="true"
            />
          );
        })}
      </div>

      <div role="radiogroup" aria-label="Seed" className="space-y-2">
        {FLORA.map((f) => {
          const Icon = ICONS[f.id];
          const selected = profile.selectedFlora === f.id;
          const affordable = profile.sparks >= f.cost;
          const locked = !isUnlocked(f, profile.bestAltitude);
          return (
            <button
              key={f.id}
              role="radio"
              aria-checked={selected}
              aria-disabled={locked}
              onClick={() => !locked && onSelect(f.id)}
              className={`glass-button flex w-full items-center gap-3 px-4 py-3 text-left ${selected ? '!border-white/70 !bg-white/25' : ''} ${locked ? 'opacity-55' : ''}`}
            >
              <Icon size={26} color={f.color} style={{ filter: `drop-shadow(0 0 6px ${f.glow})` }} />
              <span className="flex-1">
                <span className="block text-[16px] font-semibold">{f.name}</span>
                <span className="block text-[13px] text-white/60">{locked ? `Reach the ${f.unlockLabel} (${f.unlock} m)` : f.blurb}</span>
              </span>
              {locked ? (
                <Lock size={16} className="text-white/60" aria-label="Locked" />
              ) : (
                <span className={`flex items-center gap-1 text-[15px] tabular-nums ${affordable ? 'text-spark' : 'text-white/40'}`}>
                  <Sparkles size={14} /> {f.cost}
                </span>
              )}
              <span className="w-6 text-right text-[13px] tabular-nums text-white/50">×{profile.garden[f.id] || 0}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[14px] text-white/60">
        <Sparkles size={14} className="text-spark" /> {profile.sparks} sparks to spend
      </p>
    </GlassSheet>
  );
}
