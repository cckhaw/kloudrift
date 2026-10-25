import { useState } from 'react';
import { Hand, Wind, Sprout } from 'lucide-react';

const STEPS = [
  { icon: Hand, title: 'Glide', body: 'Touch and drag anywhere. Your airship follows, a little heavy and a lot calm.' },
  { icon: Wind, title: 'Ride the updrafts', body: 'Golden rings lift you higher and double every spark you gather. Storms only ever bounce you softly.' },
  { icon: Sprout, title: 'Grow and share', body: 'Spend sparks to tap-plant islands drifting below, and catch or release wind-bottles from the dock.' },
];

export default function Tutorial({ onDone }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const Icon = step.icon;

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center animate-fade-in">
      <div className="absolute inset-0 bg-twilight/35" />
      <div role="dialog" aria-modal="true" aria-label="How to play" className="glass-sheet animate-sheet-up safe-bottom relative mx-3 mb-3 w-full max-w-md p-6 text-center">
        <Icon size={32} className="mx-auto mb-3 text-lantern" aria-hidden="true" />
        <h2 className="text-[22px] font-semibold tracking-tight">{step.title}</h2>
        <p className="mt-2 min-h-[72px] text-[16px] text-white/75">{step.body}</p>
        <div className="my-3 flex justify-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, n) => (
            <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-white' : 'w-1.5 bg-white/30'}`} />
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onDone} className="glass-button flex-1 px-4 text-[16px]">Skip</button>
          <button
            autoFocus
            onClick={() => (last ? onDone() : setI(i + 1))}
            className="flex-[2] rounded-action bg-white px-6 py-3 text-[17px] font-semibold text-twilight transition active:scale-[0.98]"
          >
            {last ? 'Start drifting' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
