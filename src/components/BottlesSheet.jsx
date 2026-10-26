import { useState } from 'react';
import { Send, MailOpen, Flag } from 'lucide-react';
import { GlassSheet } from './Glass.jsx';
import { MAX_BOTTLE_LENGTH, BottleRejected, REJECT_MESSAGES } from '../lib/bottles.js';

export default function BottlesSheet({ profile, onRelease, onClose }) {
  const [tab, setTab] = useState('release');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canSend = text.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    setError('');
    try {
      await onRelease(text);
    } catch (err) {
      setError(err instanceof BottleRejected ? REJECT_MESSAGES[err.reason] || 'That bottle could not be released.' : 'Could not release your bottle. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassSheet title="Wind-Bottles" onClose={onClose}>
      <div role="tablist" className="mb-4 grid grid-cols-2 gap-1 rounded-action bg-white/10 p-1">
        {[
          ['release', 'Release'],
          ['caught', `Caught (${profile.caught.length})`],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-[40px] rounded-[12px] text-[15px] font-medium transition ${tab === id ? 'bg-white/90 text-twilight' : 'text-white/80'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'release' ? (
        <>
          <p className="mb-3 text-[15px] text-white/70">
            Write one kind, anonymous thought. It drifts into the cloud stream for another wanderer.
          </p>
          <label htmlFor="bottle-text" className="sr-only">Your message</label>
          <textarea
            id="bottle-text"
            value={text}
            maxLength={MAX_BOTTLE_LENGTH}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            placeholder="Something gentle for a stranger…"
            rows={4}
            className="w-full resize-none rounded-action border border-white/20 bg-white/10 p-3 text-[17px] text-white placeholder-white/40 outline-none focus:border-white/60"
          />
          <div className="mt-1 text-right text-[12px] tabular-nums text-white/50">
            {text.length}/{MAX_BOTTLE_LENGTH}
          </div>
          {error && (
            <p role="alert" className="mt-2 rounded-action border border-white/20 bg-white/10 p-3 text-[14px] text-white/90">
              {error}
            </p>
          )}
          <button
            onClick={submit}
            disabled={!canSend}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-action bg-lantern px-6 py-3.5 text-[17px] font-semibold text-twilight transition active:scale-[0.98] disabled:opacity-40"
          >
            <Send size={18} /> Release into the stream
          </button>
          {profile.sent.length > 0 && (
            <p className="mt-3 text-center text-[13px] text-white/50">
              You have released {profile.sent.length} bottle{profile.sent.length > 1 ? 's' : ''}.
            </p>
          )}
        </>
      ) : profile.caught.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-white/60">
          No bottles yet. Glass bottles glimmer now and then as you drift — fly through one to catch it.
        </p>
      ) : (
        <ul className="space-y-2">
          {profile.caught.map((b) => (
            <li key={b.id} className="rounded-action border border-white/15 bg-white/10 p-3 text-[16px] leading-snug">
              “{b.text}”
              {b.source === 'wanderer' && <span className="mt-1 block text-[12px] text-white/50">From another wanderer</span>}
            </li>
          ))}
        </ul>
      )}
    </GlassSheet>
  );
}

export function CatchModal({ bottle, onReport, onClose }) {
  return (
    <GlassSheet title="A bottle drifted to you" onClose={onClose}>
      <div className="flex flex-col items-center py-2 text-center">
        <MailOpen size={30} className="mb-3 text-mist" aria-hidden="true" />
        {bottle ? (
          <p className="text-[20px] leading-snug">“{bottle.text}”</p>
        ) : (
          <p className="text-white/60">Unrolling the note…</p>
        )}
        <p className="mt-4 text-[13px] text-white/50">
          {bottle?.source === 'wanderer' ? 'From another wanderer · saved to your Caught bottles.' : 'Saved to your Caught bottles.'}
        </p>
        {bottle?.source === 'wanderer' && (
          <button onClick={() => onReport(bottle)} className="glass-button mt-3 flex items-center gap-1.5 px-4 text-[14px] text-white/70">
            <Flag size={14} /> Report this bottle
          </button>
        )}
      </div>
    </GlassSheet>
  );
}
