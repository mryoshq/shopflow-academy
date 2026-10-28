import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"

/**
 * ShopFlow Academy visual direction (see docs/DESIGN.md).
 * Brand: deep teal (trust, data). Accent: saffron (warmth, used sparingly).
 * Neutrals: warm sand canvas and white surfaces. All text pairs meet WCAG AA.
 */
const config = defineConfig({
  globalCss: {
    "html, body": { background: "app.canvas", color: "app.ink" },
    html: { colorScheme: "light" },
    "html.dark": { colorScheme: "dark" },
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
      // Every colour has a light value and a `_dark` value (docs/DESIGN.md). Pairs meet WCAG AA in both.
      colors: {
        brand: {
          solid: { value: { base: "{colors.brand.600}", _dark: "{colors.brand.500}" } },
          contrast: { value: { base: "white", _dark: "white" } },
          fg: { value: { base: "{colors.brand.700}", _dark: "{colors.brand.300}" } },
          muted: { value: { base: "{colors.brand.100}", _dark: "{colors.brand.800}" } },
          subtle: { value: { base: "{colors.brand.50}", _dark: "#10302A" } },
          emphasized: { value: { base: "{colors.brand.200}", _dark: "{colors.brand.700}" } },
          focusRing: { value: { base: "{colors.brand.500}", _dark: "{colors.brand.300}" } },
        },
        saffron: {
          solid: { value: { base: "{colors.saffron.700}", _dark: "{colors.saffron.300}" } },
          contrast: { value: { base: "white", _dark: "#1B1206" } },
          fg: { value: { base: "{colors.saffron.800}", _dark: "{colors.saffron.300}" } },
          muted: { value: { base: "{colors.saffron.100}", _dark: "{colors.saffron.900}" } },
          subtle: { value: { base: "{colors.saffron.50}", _dark: "#2A1F10" } },
          emphasized: { value: { base: "{colors.saffron.200}", _dark: "{colors.saffron.800}" } },
          focusRing: { value: { base: "{colors.saffron.500}", _dark: "{colors.saffron.400}" } },
        },
        // Default green.solid (600) fails AA with white text; use 700 everywhere.
        green: { solid: { value: { base: "{colors.green.700}", _dark: "{colors.green.700}" } } },
        app: {
          canvas: { value: { base: "#F7F4EE", _dark: "#0D1513" } },
          surface: { value: { base: "#FFFFFF", _dark: "#151F1D" } },
          sunken: { value: { base: "#F1EDE4", _dark: "#1B2724" } },
          border: { value: { base: "#E2DDD3", _dark: "#2E3D3A" } },
          ink: { value: { base: "#14211F", _dark: "#E6EEEB" } },
          muted: { value: { base: "#4A5A56", _dark: "#A9B8B4" } },
        },
        // Code blocks: syntax colours at least 4.5:1 on code.bg in both themes.
        code: {
          bg: { value: { base: "#F4F1EA", _dark: "#101917" } },
          fg: { value: { base: "#14211F", _dark: "#E6EEEB" } },
          keyword: { value: { base: "#0F5047", _dark: "#7FD1BE" } },
          string: { value: { base: "#7A4A12", _dark: "#F2C27A" } },
          comment: { value: { base: "#566460", _dark: "#9DAEA9" } },
          number: { value: { base: "#6B2C91", _dark: "#D9AEF2" } },
          border: { value: { base: "#E2DDD3", _dark: "#2E3D3A" } },
        },
        chart: {
          grid: { value: { base: "#E2DDD3", _dark: "#2E3D3A" } },
          axis: { value: { base: "#4A5A56", _dark: "#A9B8B4" } },
          one: { value: { base: "{colors.brand.600}", _dark: "{colors.brand.300}" } },
          two: { value: { base: "{colors.saffron.700}", _dark: "{colors.saffron.300}" } },
        },
      },
      shadows: {
        card: { value: { base: "0 1px 2px rgba(20, 33, 31, 0.06), 0 4px 16px rgba(20, 33, 31, 0.04)", _dark: "0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.25)" } },
      },
    },
  },
})

export const system = createSystem(defaultConfig, config)
