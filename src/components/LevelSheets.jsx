import { Flag, Sparkles, Star, Repeat, Map as MapIcon, ArrowRight } from 'lucide-react';
import { GlassSheet } from './Glass.jsx';
import Stars from './Stars.jsx';
import { WeatherIcon, weatherLabel } from './JourneySheet.jsx';
import { worldOf, STAR_REWARD, SPARK_STAR_RATIO } from '../game/levels.js';

/** Shown before each level: what the goal is, what the weather will do, what the stars ask for. */
export function LevelIntro({ level, best, onFly, onMap }) {
  const world = worldOf(level);
  return (
    <GlassSheet title={`${world.name} · ${level.n}`} onClose={onMap}>
      <h3 className="-mt-2 mb-3 text-[20px] font-semibold">{level.name}</h3>
      <ul className="space-y-2.5 text-[16px]">
        <li className="flex items-start gap-3">
          <Flag size={18} className="mt-0.5 shrink-0 text-lantern" />
          <span><strong className="font-semibold">Reach the Beacon.</strong> <span className="text-white/60">No timer, no game over — storms only bounce you.</span></span>
        </li>
        <li className="flex items-start gap-3">
          <Sparkles size={18} className="mt-0.5 shrink-0 text-spark" />
          <span>Collect {Math.round(SPARK_STAR_RATIO * 100)}% of the sparks <span className="text-white/60">for a second star</span></span>
        </li>
        <li className="flex items-start gap-3">
          <Star size={18} className="mt-0.5 shrink-0 text-lantern" />
          <span>{level.bonus.label} <span className="text-white/60">for the third</span></span>
        </li>
        <li className="flex items-start gap-3">
          <WeatherIcon weather={level.weather} size={18} />
          <span className="text-white/80">
            {weatherLabel(level.weather)}
            {level.gust && ' · wind gusts push you off course — hold steady'}
          </span>
        </li>
      </ul>
      {best > 0 && <div className="mt-3 flex items-center gap-2 text-[13px] text-white/50">Your best: <Stars earned={best} size={13} /></div>}
      <button
        onClick={onFly}
        className="mt-5 w-full rounded-action bg-white px-6 py-3.5 text-[17px] font-semibold text-twilight transition active:scale-[0.98]"
      >
        Fly
      </button>
    </GlassSheet>
  );
}

export function LevelComplete({ result, newStars, hasNext, onNext, onRetry, onMap }) {
  const { level, stars, sparks, total, target, bonus } = result;
  const count = stars.filter(Boolean).length;
  return (
    <GlassSheet title="Beacon reached" onClose={onMap}>
      <div className="flex flex-col items-center py-1 text-center">
        <Stars earned={stars} size={38} />
        <p className="mt-2 text-[17px] font-semibold">{count === 3 ? 'Perfect flight' : count === 2 ? 'Lovely flying' : 'Safe landing'}</p>
        <p className="text-[14px] text-white/60">{level.name}</p>
      </div>
      <ul className="mt-3 space-y-2 text-[15px]">
        <Row done label="Reached the Beacon" />
        <Row done={stars[1]} label={`Sparks ${sparks}/${total}`} hint={stars[1] ? null : `need ${target}`} />
        <Row done={stars[2]} label={level.bonus.label} hint={stars[2] || level.bonus.type === 'clean' ? null : `${bonus.value}/${bonus.target}`} />
      </ul>
      {newStars > 0 && (
        <p className="mt-3 text-center text-[14px] text-spark">
          +{newStars * STAR_REWARD} sparks for {newStars} new star{newStars > 1 ? 's' : ''}
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={onRetry} className="glass-button flex items-center justify-center gap-2 px-4 text-[15px]">
          <Repeat size={16} /> Retry
        </button>
        <button onClick={onMap} className="glass-button flex items-center justify-center gap-2 px-4 text-[15px]">
          <MapIcon size={16} /> Map
        </button>
      </div>
      {hasNext && (
        <button
          onClick={onNext}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-action bg-white px-6 py-3.5 text-[17px] font-semibold text-twilight transition active:scale-[0.98]"
        >
          Next level <ArrowRight size={18} />
        </button>
      )}
    </GlassSheet>
  );
}

function Row({ done, label, hint }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2">
        <Star size={15} className={done ? 'text-lantern' : 'text-white/25'} fill={done ? 'currentColor' : 'none'} />
        <span className={done ? '' : 'text-white/60'}>{label}</span>
      </span>
      {hint && <span className="text-[13px] text-white/50">{hint}</span>}
    </li>
  );
}
