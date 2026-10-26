import { Lock, CloudRain, CloudFog, Snowflake, CloudLightning, Wind, Sun } from 'lucide-react';
import { GlassSheet } from './Glass.jsx';
import Stars from './Stars.jsx';
import { WORLDS, isLevelUnlocked } from '../game/levels.js';

const WEATHER_ICON = { clear: Sun, breeze: Wind, rain: CloudRain, fog: CloudFog, snow: Snowflake, storm: CloudLightning };
const WEATHER_LABEL = { clear: 'Clear', breeze: 'Breezy', rain: 'Rain', fog: 'Fog', snow: 'Snow', storm: 'Thunderstorm' };

export function weatherLabel(w) {
  const parts = [];
  if (w.type !== 'clear' || !w.fog) parts.push(WEATHER_LABEL[w.type]);
  if (w.fog) parts.push('Fog');
  return parts.join(' + ');
}

export function WeatherIcon({ weather, size = 16 }) {
  const Icon = WEATHER_ICON[weather.fog && weather.type === 'clear' ? 'fog' : weather.type] || Sun;
  return <Icon size={size} aria-hidden="true" />;
}

export default function JourneySheet({ stars, onPlay, onFreeDrift, onClose }) {
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  return (
    <GlassSheet title="Journey" onClose={onClose}>
      <p className="mb-1 text-[15px] text-white/70">
        Fly to the glowing <strong className="font-semibold text-white">Beacon</strong> at the end of each level. Stars are optional:
      </p>
      <ul className="mb-4 space-y-0.5 text-[14px] text-white/60">
        <li>★ Reach the Beacon</li>
        <li>★ Collect 60% of the sparks</li>
        <li>★ Complete the bonus challenge</li>
      </ul>

      <div className="space-y-3">
        {WORLDS.map((world) => {
          const worldStars = world.levels.reduce((n, l) => n + (stars[l.id] || 0), 0);
          return (
            <section key={world.id} className="rounded-action border border-white/15 bg-white/10 p-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[17px] font-semibold">
                  {world.name}
                  {world.dim === '3d' && <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 align-middle text-[11px] font-semibold tracking-wide">3D</span>}
                </h3>
                <span className="text-[13px] tabular-nums text-white/50">{worldStars}/{world.levels.length * 3} ★</span>
              </div>
              <p className="mb-2 text-[13px] text-white/60">{world.blurb}</p>
              <div className="grid grid-cols-4 gap-2">
                {world.levels.map((lvl) => {
                  const open = isLevelUnlocked(lvl, stars);
                  return (
                    <button
                      key={lvl.id}
                      disabled={!open}
                      onClick={() => onPlay(lvl)}
                      aria-label={`${world.name} level ${lvl.n}: ${lvl.name}${open ? '' : ', locked'}`}
                      className="glass-button flex flex-col items-center justify-center gap-1 px-1 py-2 disabled:opacity-40"
                    >
                      {open ? <span className="text-[18px] font-semibold tabular-nums">{lvl.n}</span> : <Lock size={18} />}
                      <Stars earned={stars[lvl.id] || 0} size={11} />
                      <WeatherIcon weather={lvl.weather} size={13} />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[13px] text-white/50 tabular-nums">{total} ★ earned</span>
        <button onClick={onFreeDrift} className="glass-button px-4 text-[15px]">Free Drift (no goal)</button>
      </div>
    </GlassSheet>
  );
}
