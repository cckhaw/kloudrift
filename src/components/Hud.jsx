import { Sparkles, Volume2, VolumeX, Sprout, MailOpen, Wind } from 'lucide-react';
import { Pill } from './Glass.jsx';

export default function Hud({ sparks, hud, muted, toast, sheetOpen, onMute, onOpen }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between px-4">
      <div className="safe-top">
        <div className="flex items-center justify-between gap-2">
          <Pill className="pointer-events-auto" aria-label={`${sparks} light sparks`}>
            <Sparkles size={18} className="text-spark" />
            <span className="tabular-nums">{sparks}</span>
          </Pill>

          <Pill className="min-w-0">
            <Wind size={16} className={hud.inThermal ? 'text-spark' : 'text-mist'} />
            <span className="truncate">{hud.zone}</span>
            <span className="tabular-nums text-white/60">{hud.altitude} m</span>
            {hud.inThermal && <span className="rounded-full bg-spark/25 px-2 text-[13px] text-spark">×2</span>}
          </Pill>

          <button
            onClick={onMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            aria-pressed={muted}
            className="glass-button pointer-events-auto flex shrink-0 items-center justify-center shadow-glass-sm"
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>

        <div className="mt-3 flex justify-center" role="status" aria-live="polite">
          {toast && (
            <Pill className="animate-fade-in !min-h-[36px] text-[14px]">{toast}</Pill>
          )}
        </div>
      </div>

      <div className={`safe-bottom flex justify-center transition-opacity ${sheetOpen ? 'opacity-0' : ''}`} aria-hidden={sheetOpen}>
        <nav className={`glass flex gap-1 rounded-[22px] p-1.5 ${sheetOpen ? 'pointer-events-none' : 'pointer-events-auto'}`} aria-label="Menus">
          <DockButton icon={<Sprout size={20} />} label="Sanctuary" onClick={() => onOpen('sanctuary')} />
          <DockButton icon={<MailOpen size={20} />} label="Bottles" onClick={() => onOpen('bottles')} />
        </nav>
      </div>
    </div>
  );
}

function DockButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="glass-button flex items-center gap-2 border-transparent bg-transparent px-5 text-[15px] font-medium"
    >
      {icon}
      {label}
    </button>
  );
}
