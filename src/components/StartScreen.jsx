import { Play } from 'lucide-react';

export default function StartScreen({ onBegin, best }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-6 animate-fade-in">
      <div className="glass-sheet animate-sheet-up w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-5 h-14 w-14 animate-float rounded-full bg-lantern shadow-[0_0_48px_12px_rgba(255,209,102,0.55)]" aria-hidden="true" />
        <h1 className="text-[40px] font-semibold leading-none tracking-tight">kloudrift</h1>
        <p className="mt-3 text-[17px] text-white/75">A quiet airship drifting through endless sky.</p>
        <ul className="mt-5 space-y-1 text-[15px] text-white/60">
          <li>Touch and drag to glide</li>
          <li>Ride golden updrafts for double sparks</li>
          <li>Storms only ever bounce you softly</li>
        </ul>
        <button
          onClick={onBegin}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-action bg-white px-6 py-3.5 text-[17px] font-semibold text-twilight transition active:scale-[0.98]"
        >
          <Play size={18} fill="currentColor" /> Begin
        </button>
        {best > 0 && <p className="mt-4 text-[13px] text-white/50">Highest drift: {best} m</p>}
        <p className="mt-2 text-[12px] text-white/40">Sound on for the full experience · headphones recommended</p>
      </div>
    </div>
  );
}
