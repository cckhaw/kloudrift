import { Star } from 'lucide-react';

/** Three stars; `earned` is an array of booleans (or a count). */
export default function Stars({ earned, size = 16, className = '' }) {
  const flags = Array.isArray(earned) ? earned : [0, 1, 2].map((i) => i < earned);
  return (
    <span className={`inline-flex gap-0.5 ${className}`} role="img" aria-label={`${flags.filter(Boolean).length} of 3 stars`}>
      {flags.map((on, i) => (
        <Star key={i} size={size} className={on ? 'text-lantern' : 'text-white/25'} fill={on ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}
