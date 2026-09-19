/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface-2) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        forest: 'rgb(var(--forest) / <alpha-value>)',
        emerald: 'rgb(var(--emerald) / <alpha-value>)',
        lime: 'rgb(var(--lime) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
        rose: 'rgb(var(--rose) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        card: '20px',
        xl2: '24px',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.12)',
        lift: '0 2px 4px rgb(0 0 0 / 0.04), 0 16px 40px -16px rgb(0 0 0 / 0.22)',
        glow: '0 0 0 1px rgb(var(--emerald) / 0.25), 0 8px 32px -8px rgb(var(--emerald) / 0.35)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(to right, rgb(var(--line) / 0.5) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--line) / 0.5) 1px, transparent 1px)',
      },
      keyframes: {
        scanline: {
          '0%': { transform: 'translateY(-10%)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(110%)', opacity: '0' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        growBar: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.82)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        spinSlow: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        scanline: 'scanline 2.6s cubic-bezier(0.4,0,0.6,1) infinite',
        fadeUp: 'fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both',
        growBar: 'growBar 0.8s cubic-bezier(0.16,1,0.3,1) both',
        pulseDot: 'pulseDot 1.8s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
        spinSlow: 'spinSlow 1.1s linear infinite',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
