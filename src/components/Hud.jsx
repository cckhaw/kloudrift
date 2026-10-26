import { Sparkles, Volume2, VolumeX, Sprout, MailOpen, Wind, Settings, Sun, Flag, Star, Check } from 'lucide-react';
import { Pill } from './Glass.jsx';
import { WeatherIcon } from './JourneySheet.jsx';

export default function Hud({ sparks, hud, muted, toast, sheetOpen, onMute, onOpen }) {
  const level = hud.mode === 'level';
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between px-4">
      <div className="safe-top">
        <div className="flex items-center justify-between gap-2">
          <Pill className="pointer-events-auto" aria-label={`${sparks} light sparks`}>
            <Sparkles size={18} className="text-spark" />
            <span className="tabular-nums">{sparks}</span>
          </Pill>

          {level ? (
            <Pill className="min-w-0">
              <WeatherIcon weather={{ type: hud.weather, fog: hud.fog }} size={16} />
              <span className="truncate">{hud.levelName}</span>
            </Pill>
          ) : (
            <Pill className="min-w-0">
              <Wind size={16} className={hud.inThermal ? 'text-spark' : 'text-mist'} />
              <span className="truncate">{hud.zone}</span>
              <span className="tabular-nums text-white/60">{hud.altitude} m</span>
              {hud.inThermal && <span className="rounded-full bg-spark/25 px-2 text-[13px] text-spark">×2</span>}
            </Pill>
          )}

          <button
            onClick={onMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            aria-pressed={muted}
            className="glass-button pointer-events-auto flex shrink-0 items-center justify-center shadow-glass-sm"
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>

        {level && <Objectives hud={hud} />}

        <div className="mt-3 flex justify-center" role="status" aria-live="polite">
          {toast && <Pill className="animate-fade-in !min-h-[36px] text-[14px]">{toast}</Pill>}
        </div>
      </div>

      <div className={`safe-bottom flex justify-center transition-opacity ${sheetOpen ? 'opacity-0' : ''}`} aria-hidden={sheetOpen}>
        <nav
          className={`glass flex gap-1 rounded-[22px] p-1.5 ${sheetOpen ? 'pointer-events-none' : 'pointer-events-auto'}`}
          aria-label="Menus"
        >
          <DockButton icon={<Sprout size={20} />} label="Sanctuary" onClick={() => onOpen('sanctuary')} />
          <DockButton icon={<MailOpen size={20} />} label="Bottles" onClick={() => onOpen('bottles')} />
          <IconButton label="Today's gentle goals" onClick={() => onOpen('daily')}>
            <Sun size={20} />
          </IconButton>
          <IconButton label="Pause and settings" onClick={() => onOpen('settings')}>
            <Settings size={20} />
          </IconButton>
        </nav>
      </div>
    </div>
  );
}

/** Beacon progress plus the two optional star goals, always visible during a level. */
function Objectives({ hud }) {
  const sparksDone = hud.sparks >= hud.sparkTarget;
  const clean = hud.bonusType === 'clean';
  return (
    <div className="mt-2 rounded-[18px] bg-twilight/35 p-2.5 backdrop-blur-xl" aria-label="Level objectives">
      <div className="flex items-center gap-2">
        <Flag size={14} className="shrink-0 text-lantern" aria-hidden="true" />
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-white/20"
          role="progressbar"
          aria-label="Progress to the Beacon"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hud.progress}
        >
          <div className="h-full rounded-full bg-lantern" style={{ width: `${hud.progress}%` }} />
        </div>
        <span className="w-9 text-right text-[12px] tabular-nums text-white/70">{hud.progress}%</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
        <Chip done={sparksDone} icon={<Sparkles size={12} />}>
          {hud.sparks}/{hud.sparkTarget} sparks
        </Chip>
        <Chip done={clean ? false : hud.bonusDone} failed={clean && !hud.bonusDone} icon={<Star size={12} />}>
          {clean ? (hud.bonusDone ? 'No storm touches' : 'Storm touched') : `${hud.bonusLabel} ${hud.bonusValue}/${hud.bonusTarget}`}
        </Chip>
      </div>
    </div>
  );
}

function Chip({ done, failed, icon, children }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 ${
        done ? 'bg-[#34C759]/30 text-white' : failed ? 'bg-white/10 text-white/45 line-through' : 'bg-white/15 text-white/80'
      }`}
    >
      {done ? <Check size={12} /> : icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function IconButton({ label, onClick, children }) {
  return (
    <button onClick={onClick} aria-label={label} className="glass-button flex items-center justify-center border-transparent bg-transparent">
      {children}
    </button>
  );
}

function DockButton({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="glass-button flex items-center gap-2 border-transparent bg-transparent px-4 text-[15px] font-medium">
      {icon}
      {label}
    </button>
  );
}
