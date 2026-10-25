import { useState } from 'react';
import { Volume2, VolumeX, HelpCircle, Trash2 } from 'lucide-react';
import { GlassSheet } from './Glass.jsx';

function Row({ children }) {
  return <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-white/10 py-2 last:border-0">{children}</div>;
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? 'bg-[#34C759]' : 'bg-white/25'}`}
    >
      <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-[2px]'}`} />
    </button>
  );
}

export default function SettingsSheet({ profile, onChange, onReplayTutorial, onReset, onClose }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <GlassSheet title="Paused" onClose={onClose}>
      <p className="mb-2 text-[15px] text-white/70">The sky is holding still. Take your time.</p>

      <Row>
        <span className="flex items-center gap-2 text-[16px]">
          {profile.muted ? <VolumeX size={18} /> : <Volume2 size={18} />} Sound
        </span>
        <Toggle checked={!profile.muted} onChange={(on) => onChange({ muted: !on })} label="Sound" />
      </Row>
      <Row>
        <label htmlFor="vol" className="text-[16px]">Volume</label>
        <input
          id="vol"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={profile.volume}
          disabled={profile.muted}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
          className="h-11 w-44 accent-white disabled:opacity-40"
        />
      </Row>
      <Row>
        <span>
          <span className="block text-[16px]">Calm mode</span>
          <span className="block text-[13px] text-white/60">Fewer particles and flashes</span>
        </span>
        <Toggle checked={profile.calm} onChange={(calm) => onChange({ calm })} label="Calm mode" />
      </Row>
      <Row>
        <span className="flex items-center gap-2 text-[16px]"><HelpCircle size={18} /> How to play</span>
        <button onClick={onReplayTutorial} className="glass-button px-4 text-[15px]">Replay</button>
      </Row>

      <button
        onClick={onClose}
        className="mt-5 w-full rounded-action bg-white px-6 py-3.5 text-[17px] font-semibold text-twilight transition active:scale-[0.98]"
      >
        Resume
      </button>

      <div className="mt-5 text-center">
        {confirming ? (
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => setConfirming(false)} className="glass-button px-4 text-[15px]">Keep progress</button>
            <button onClick={onReset} className="glass-button px-4 text-[15px] !border-red-300/50 text-red-200">Erase everything</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="inline-flex min-h-[44px] items-center gap-1.5 px-3 text-[14px] text-white/50">
            <Trash2 size={14} /> Reset progress
          </button>
        )}
      </div>
    </GlassSheet>
  );
}
