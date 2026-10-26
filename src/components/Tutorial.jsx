import { useState } from 'react';
import { Hand, Flag, Wind, Sprout } from 'lucide-react';

const STEPS = [
  { icon: Hand, title: 'Glide', body: 'Touch and drag anywhere. Your airship follows, a little heavy and a lot calm.' },
  { icon: Flag, title: 'Reach the Beacon', body: 'In Journey, every level ends at a glowing Beacon. Earn up to three stars: reach it, gather sparks, and finish the bonus. There is no timer and no game over.' },
  { icon: Wind, title: 'Weather and updrafts', body: 'Golden rings lift you and double sparks. Higher worlds bring rain, fog and wind gusts: hold steady and they pass. Storm clouds only bounce you.' },
  { icon: Sprout, title: 'Plant and share', body: 'When a floating island shows “Tap to plant”, tap it to grow your selected seed with sparks. Catch or release wind-bottles from the dock.' },
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
