import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        twilight: '#1A1B35',
        amber: { sunset: '#FF8B42' },
        lavender: { soft: '#E2D9F3' },
        lantern: '#FFD166',
        spark: '#FFD700',
        mist: '#4EA8DE',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        sheet: '28px',
        action: '16px',
      },
      backdropBlur: {
        glass: '28px',
      },
      boxShadow: {
        glass: '0 24px 48px rgba(0, 0, 0, 0.25)',
        'glass-sm': '0 8px 20px rgba(0, 0, 0, 0.18)',
      },
      keyframes: {
        'sheet-up': {
          from: { transform: 'translateY(24px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'sheet-up': 'sheet-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 240ms ease-out both',
        float: 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [
    plugin(({ addComponents }) => {
      addComponents({
        '.glass': {
          background: 'rgba(255, 255, 255, 0.12)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(28px) saturate(160%)',
          WebkitBackdropFilter: 'blur(28px) saturate(160%)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
        },
        '.glass-sheet': {
          background: 'rgba(30, 28, 58, 0.55)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(28px) saturate(160%)',
          WebkitBackdropFilter: 'blur(28px) saturate(160%)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
          borderRadius: '28px',
        },
        '.glass-button': {
          background: 'rgba(255, 255, 255, 0.14)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          borderRadius: '16px',
          minHeight: '44px',
          minWidth: '44px',
          transition: 'transform 160ms ease, background 160ms ease',
        },
        '.glass-button:active': {
          transform: 'scale(0.96)',
          background: 'rgba(255, 255, 255, 0.24)',
        },
      });
    }),
  ],
};
