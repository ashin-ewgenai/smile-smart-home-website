/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        charcoal: '#2E3A3A',
        // Restore full Tailwind teal scale and also provide a DEFAULT shade for "bg-teal"
        teal: { ...colors.teal, DEFAULT: '#009688' },
        'soft-gray': '#F5F7F8',
        border: 'rgb(var(--color-border) / <alpha-value>)'
      },
      boxShadow: {
        // soft, layered shadow used for glass surfaces
        'soft': '0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.08)',
        'soft-lg': '0 2px 6px rgba(0,0,0,0.04), 0 20px 40px rgba(0,0,0,0.12)'
      },
      borderRadius: {
        'xl': '0.9rem',
        '2xl': '1.2rem'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      fontSize: {
        'display': ['clamp(3.5rem, 8vw, 4rem)', { lineHeight: '1.1' }],
        'heading-lg': ['clamp(2rem, 5vw, 2.5rem)', { lineHeight: '1.2' }],
        'body-lg': ['clamp(1rem, 2vw, 1.125rem)', { lineHeight: '1.6' }]
      },
      maxWidth: {
        'container': '1200px'
      },
      animation: {
        'fade-in': 'fadeIn 0.28s ease-out',
        'slide-up': 'slideUp 0.24s ease-out',
        'scale-in': 'scaleIn 0.16s ease-out',
        'progress': 'progress 0.1s ease-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        progress: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' }
        }
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)'
      },
      transitionDuration: {
        '120': '120ms',
        '160': '160ms'
      },
      ringWidth: {
        '1': '1px',
        '2': '2px',
        '3': '3px',
        '4': '4px'
      }
    }
  },
  plugins: []
};