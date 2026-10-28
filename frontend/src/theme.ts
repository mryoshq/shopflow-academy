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
    // ADR-0029: 44 px touch targets on phones and touch screens (WCAG 2.5.5), without changing the desktop layout.
    "button, [role=button], [role=tab], select, input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea": {
      "@media (max-width: 47.99em), (pointer: coarse)": { minHeight: "44px" },
    },
    "button, [role=button], [role=tab]": {
      "@media (max-width: 47.99em), (pointer: coarse)": { minWidth: "44px" },
    },
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
          // ADR-0024: white on brand.600 = 7.02:1 (AAA) in both themes (was 5.18:1 in dark).
          solid: { value: { base: "{colors.brand.600}", _dark: "{colors.brand.600}" } },
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
        // Default green.solid (600) fails AA with white text; use 700 everywhere. `_light`, not `base`:
        // Chakra's own token has a `_light` value that would win over `base`.
        green: { solid: { value: { _light: "{colors.green.700}", _dark: "{colors.green.700}" } } },
        // Chakra's own surfaces (tables, inputs, menus) follow the app surfaces, not pure black.
        bg: {
          DEFAULT: { value: { _light: "#FFFFFF", _dark: "#151F1D" } },
          panel: { value: { _light: "#FFFFFF", _dark: "#151F1D" } },
        },
        app: {
          canvas: { value: { base: "#F7F4EE", _dark: "#0D1513" } },
          surface: { value: { base: "#FFFFFF", _dark: "#151F1D" } },
          sunken: { value: { base: "#F1EDE4", _dark: "#1B2724" } },
          border: { value: { base: "#E2DDD3", _dark: "#2E3D3A" } },
          ink: { value: { base: "#14211F", _dark: "#E6EEEB" } },
          muted: { value: { base: "#4A5A56", _dark: "#A9B8B4" } },
          // Form field borders: >= 3:1 against canvas, surface and sunken (WCAG 1.4.11), ADR-0024.
          field: { value: { base: "#7D8884", _dark: "#667874" } },
        },
        // Code blocks: Catppuccin (MIT, ADR-0029), Latte in light mode and Mocha in dark mode. Mocha colours are
        // official; Latte green, peach and blue are darkened (same hue) so every token is at least 4.5:1 on Latte base.
        code: {
          bg: { value: { base: "#EFF1F5", _dark: "#1E1E2E" } },
          fg: { value: { base: "#4C4F69", _dark: "#CDD6F4" } },
          keyword: { value: { base: "#8839EF", _dark: "#CBA6F7" } },
          string: { value: { base: "#317A21", _dark: "#A6E3A1" } },
          comment: { value: { base: "#5C5F77", _dark: "#9399B2" } },
          number: { value: { base: "#BC4501", _dark: "#FAB387" } },
          function: { value: { base: "#145FF5", _dark: "#89B4FA" } },
          border: { value: { base: "#CCD0DA", _dark: "#313244" } },
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
    // ADR-0024: visible field boundaries (3:1) for text inputs, text areas and selects.
    recipes: {
      input: { variants: { variant: { outline: { borderColor: "app.field" } } } },
      textarea: { variants: { variant: { outline: { borderColor: "app.field" } } } },
    },
    slotRecipes: {
      nativeSelect: { slots: ["root", "field", "indicator"], variants: { variant: { outline: { field: { borderColor: "app.field" } } } } },
    },
  },
})

export const system = createSystem(defaultConfig, config)
