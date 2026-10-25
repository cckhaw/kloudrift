import { useEffect } from 'react';
import { X } from 'lucide-react';

/** Apple-style modal sheet: frosted, 28px squircle, slides up from the bottom. */
export function GlassSheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-twilight/35" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="glass-sheet animate-sheet-up relative w-full max-w-md mx-3 mb-3 p-5 safe-bottom max-h-[82vh] overflow-y-auto"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/30" aria-hidden="true" />
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-[22px] font-semibold tracking-tight">{title}</h2>
          <button
            autoFocus
            onClick={onClose}
            aria-label="Close"
            className="glass-button flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Pill({ children, className = '', ...rest }) {
  return (
    <div
      className={`glass flex items-center gap-2 rounded-full px-4 min-h-[44px] text-[15px] font-medium shadow-glass-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
