/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // 语义色（通过 CSS 变量绑定，支持主题切换）
        canvas: "var(--bg-canvas)",
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        hover: "var(--bg-hover)",
        active: "var(--bg-active)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        accent: {
          primary: "var(--accent-primary)",
          secondary: "var(--accent-secondary)",
          warning: "var(--accent-warning)",
          danger: "var(--accent-danger)",
        },
        border: {
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        code: {
          bg: "var(--code-bg)",
          text: "var(--code-text)",
        },
        // 8 领域配色
        domain: {
          "kb-system": "#8b5cf6",
          coding: "#4a9eff",
          resources: "#10b981",
          design: "#ec4899",
          emotions: "#f59e0b",
          reading: "#06b6d4",
          academic: "#6366f1",
          life: "#84cc16",
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['12px', '1.5'],
        sm: ['13px', '1.5'],
        base: ['14px', '1.5'],
        lg: ['15px', '1.6'],
        xl: ['18px', '1.5'],
        '2xl': ['22px', '1.4'],
        '3xl': ['32px', '1.3'],
      },
      spacing: {
        'topbar': '48px',
        'statusbar': '28px',
        'left-w': '240px',
        'right-w': '320px',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.3)',
        md: '0 4px 12px rgba(0,0,0,0.4)',
        lg: '0 8px 24px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
}
