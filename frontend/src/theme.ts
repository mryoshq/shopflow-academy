import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"

/**
 * ShopFlow Academy visual direction (see docs/DESIGN.md).
 * Brand: deep teal (trust, data). Accent: saffron (warmth, used sparingly).
 * Neutrals: warm sand canvas and white surfaces. All text pairs meet WCAG AA.
 */
const config = defineConfig({
  globalCss: {
    "html, body": { background: "app.canvas", color: "app.ink" },
    body: { lineHeight: "1.6" },
    "*:focus-visible": { outline: "3px solid", outlineColor: "brand.focusRing", outlineOffset: "2px" },
    "*, *::before, *::after": {
      "@media (prefers-reduced-motion: reduce)": { animationDuration: "0.01ms !important", animationDelay: "0ms !important", transitionDuration: "0.01ms !important" },
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: { value: "'Segoe UI Variable Display', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" },
        body: { value: "'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" },
      },
      colors: {
        brand: {
          50: { value: "#EAF5F2" }, 100: { value: "#CFE8E1" }, 200: { value: "#A3D2C6" }, 300: { value: "#6FB6A6" },
          400: { value: "#3F9585" }, 500: { value: "#1F7A6B" }, 600: { value: "#146457" }, 700: { value: "#0F5047" },
          800: { value: "#0D3F39" }, 900: { value: "#0B302C" }, 950: { value: "#061C1A" },
        },
        saffron: {
          50: { value: "#FDF6EA" }, 100: { value: "#FAE8C7" }, 200: { value: "#F4D08E" }, 300: { value: "#EDB458" },
          400: { value: "#E39A33" }, 500: { value: "#C9822B" }, 600: { value: "#A86A1F" }, 700: { value: "#84521A" },
          800: { value: "#643E16" }, 900: { value: "#4A2F12" }, 950: { value: "#2B1B0A" },
        },
      },
      radii: { card: { value: "14px" } },
    },
    semanticTokens: {
      colors: {
        brand: {
          solid: { value: "{colors.brand.600}" }, contrast: { value: "white" }, fg: { value: "{colors.brand.700}" },
          muted: { value: "{colors.brand.100}" }, subtle: { value: "{colors.brand.50}" },
          emphasized: { value: "{colors.brand.200}" }, focusRing: { value: "{colors.brand.500}" },
        },
        saffron: {
          solid: { value: "{colors.saffron.700}" }, contrast: { value: "white" }, fg: { value: "{colors.saffron.800}" },
          muted: { value: "{colors.saffron.100}" }, subtle: { value: "{colors.saffron.50}" },
          emphasized: { value: "{colors.saffron.200}" }, focusRing: { value: "{colors.saffron.500}" },
        },
        // Default green.solid (600) fails AA with white text; use 700 everywhere.
        green: { solid: { value: "{colors.green.700}" } },
        app: {
          canvas: { value: "#F7F4EE" }, surface: { value: "#FFFFFF" }, sunken: { value: "#F1EDE4" },
          border: { value: "#E2DDD3" }, ink: { value: "#14211F" }, muted: { value: "#4A5A56" },
        },
        // Code blocks: light syntax colours, each at least 4.5:1 on code.bg.
        code: {
          bg: { value: "#F4F1EA" }, fg: { value: "#14211F" }, keyword: { value: "#0F5047" }, string: { value: "#7A4A12" },
          comment: { value: "#566460" }, number: { value: "#6B2C91" }, border: { value: "#E2DDD3" },
        },
        chart: {
          grid: { value: "#E2DDD3" }, axis: { value: "#4A5A56" }, one: { value: "{colors.brand.600}" }, two: { value: "{colors.saffron.700}" },
        },
      },
      shadows: {
        card: { value: "0 1px 2px rgba(20, 33, 31, 0.06), 0 4px 16px rgba(20, 33, 31, 0.04)" },
      },
    },
  },
})

export const system = createSystem(defaultConfig, config)
