import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"

/**
 * Rapidfox Academy visual direction (see docs/DESIGN.md, ADR-0035).
 * Calm, editorial interface: warm ivory canvas and warm greys, a clay accent used sparingly,
 * serif headings, soft corners and light shadows. Warm charcoal in dark mode. All text pairs meet WCAG AA.
 */
const config = defineConfig({
  globalCss: {
    "html, body": { background: "app.canvas", color: "app.ink" },
    html: { colorScheme: "light" },
    "html.dark": { colorScheme: "dark" },
    body: { lineHeight: "1.6" },
    "h1, h2, h3": { letterSpacing: "-0.01em" },
    // ADR-0029: 44 px touch targets on phones and touch screens (WCAG 2.5.5), without changing the desktop layout.
    "button, [role=button], [role=tab], select, input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea": {
      "@media (max-width: 47.99em), (pointer: coarse)": { minHeight: "44px" },
    },
    "button, [role=button], [role=tab]": {
      "@media (max-width: 47.99em), (pointer: coarse)": { minWidth: "44px" },
    },
    // ADR-0031: short fade between teacher views (zeroed by prefers-reduced-motion below).
    ".view-enter": { animation: "viewEnter 180ms cubic-bezier(0.2, 0, 0, 1)" },
    // ADR-0036: one motion language, short and smooth: colours ease in 120 ms, a press sinks by 2 %.
    "button, a, [role=menuitem], [role=menuitemradio], [role=tab], [role=radio], input, textarea, select": {
      transitionProperty: "background-color, border-color, color, box-shadow, transform, opacity",
      transitionDuration: "120ms",
      transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
    },
    "button:not(:disabled):active, [role=button]:not([aria-disabled=true]):active": { transform: "scale(0.98)" },
    ".menu-pop[data-state=open]": { animationDuration: "140ms !important", animationTimingFunction: "cubic-bezier(0.2, 0, 0, 1) !important" },
    ".zoom-toast": { animation: "toastIn 160ms cubic-bezier(0.2, 0, 0, 1)" },
    ".nav-item[aria-current=page]::before": {
      content: '""', position: "absolute", insetInlineStart: "-0.5rem", top: "25%", bottom: "25%", width: "3px", borderRadius: "full",
      background: "var(--chakra-colors-brand-solid)", animation: "indicatorIn 180ms cubic-bezier(0.2, 0, 0, 1)",
    },
    // Settings > Animations > « Réduire les animations » (this browser), on top of the system setting below.
    "html.reduce-motion *, html.reduce-motion *::before, html.reduce-motion *::after": {
      animationDuration: "0.01ms !important", animationDelay: "0ms !important", transitionDuration: "0.01ms !important",
    },
    "*:focus-visible": { outline: "3px solid", outlineColor: "brand.focusRing", outlineOffset: "2px" },
    "*, *::before, *::after": {
      "@media (prefers-reduced-motion: reduce)": { animationDuration: "0.01ms !important", animationDelay: "0ms !important", transitionDuration: "0.01ms !important" },
    },
  },
  theme: {
    keyframes: {
      viewEnter: { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "none" } },
      toastIn: { from: { opacity: 0, transform: "translate(-50%, 6px) scale(0.98)" }, to: { opacity: 1, transform: "translate(-50%, 0)" } },
      indicatorIn: { from: { opacity: 0, transform: "scaleY(0.4)" }, to: { opacity: 1, transform: "none" } },
    },
    tokens: {
      fonts: {
        // Serif headings with fonts already installed (CSP: no web font): Iowan/Charter on Mac, Palatino Linotype or Georgia on Windows.
        heading: { value: "'Iowan Old Style', Charter, 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, ui-serif, serif" },
        body: { value: "'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" },
      },
      colors: {
        // Clay accent (ADR-0035).
        brand: {
          50: { value: "#FBF2ED" }, 100: { value: "#F6E0D6" }, 200: { value: "#EDC0AC" }, 300: { value: "#E0967A" },
          400: { value: "#D97757" }, 500: { value: "#C96442" }, 600: { value: "#B5532F" }, 700: { value: "#9C4426" },
          800: { value: "#7A3620" }, 900: { value: "#5A2918" }, 950: { value: "#331710" },
        },
        // Warm greys replace Chakra's cool greys everywhere (buttons, tags, tables, menus).
        gray: {
          50: { value: "#FAF9F5" }, 100: { value: "#F0EEE6" }, 200: { value: "#E6E3D9" }, 300: { value: "#D1CFC5" },
          400: { value: "#A8A69B" }, 500: { value: "#87867F" }, 600: { value: "#5E5D59" }, 700: { value: "#3E3E3A" },
          800: { value: "#30302E" }, 900: { value: "#262624" }, 950: { value: "#1F1E1D" },
        },
        saffron: {
          50: { value: "#FDF6EA" }, 100: { value: "#FAE8C7" }, 200: { value: "#F4D08E" }, 300: { value: "#EDB458" },
          400: { value: "#E39A33" }, 500: { value: "#C9822B" }, 600: { value: "#A86A1F" }, 700: { value: "#84521A" },
          800: { value: "#643E16" }, 900: { value: "#4A2F12" }, 950: { value: "#2B1B0A" },
        },
      },
      radii: { card: { value: "12px" } },
    },
    semanticTokens: {
      // Every colour has a light value and a `_dark` value (docs/DESIGN.md). Pairs meet WCAG AA in both.
      colors: {
        brand: {
          // White on brand.600 = 4.95:1 (AA) in both themes; fg = 6.1:1 on the light canvas, 6.4:1 on the dark one.
          solid: { value: { base: "{colors.brand.600}", _dark: "{colors.brand.600}" } },
          contrast: { value: { base: "white", _dark: "white" } },
          fg: { value: { base: "{colors.brand.700}", _dark: "{colors.brand.300}" } },
          muted: { value: { base: "{colors.brand.100}", _dark: "#4A2A1E" } },
          subtle: { value: { base: "{colors.brand.50}", _dark: "#33241E" } },
          emphasized: { value: { base: "{colors.brand.200}", _dark: "{colors.brand.800}" } },
          focusRing: { value: { base: "{colors.brand.500}", _dark: "{colors.brand.400}" } },
          // Outline buttons keep a neutral border (calm interface); the label carries the accent.
          border: { value: { base: "#E6E3D9", _dark: "#45453F" } },
        },
        saffron: {
          solid: { value: { base: "{colors.saffron.700}", _dark: "{colors.saffron.300}" } },
          contrast: { value: { base: "white", _dark: "#1B1206" } },
          fg: { value: { base: "{colors.saffron.800}", _dark: "{colors.saffron.300}" } },
          muted: { value: { base: "{colors.saffron.100}", _dark: "{colors.saffron.900}" } },
          subtle: { value: { base: "{colors.saffron.50}", _dark: "#2A1F10" } },
          emphasized: { value: { base: "{colors.saffron.200}", _dark: "{colors.saffron.800}" } },
          focusRing: { value: { base: "{colors.saffron.500}", _dark: "{colors.saffron.400}" } },
          border: { value: { base: "{colors.saffron.200}", _dark: "{colors.saffron.800}" } },
        },
        // Default green.solid (600) fails AA with white text; use 700 everywhere. `_light`, not `base`:
        // Chakra's own token has a `_light` value that would win over `base`.
        green: { solid: { value: { _light: "{colors.green.700}", _dark: "{colors.green.700}" } } },
        // Grey palette of Chakra (outline and ghost buttons, tags): borders and fills visible on the dark surfaces.
        gray: {
          subtle: { value: { _light: "#F0EEE6", _dark: "#2B2B29" } },
          muted: { value: { _light: "#E6E3D9", _dark: "#45453F" } },
          emphasized: { value: { _light: "#D1CFC5", _dark: "#5A5A54" } },
          // Outline buttons read `colorPalette.border`.
          border: { value: { _light: "#E6E3D9", _dark: "#45453F" } },
        },
        // Chakra's own surfaces (tables, inputs, menus) follow the app surfaces, not pure black.
        bg: {
          DEFAULT: { value: { _light: "#FFFFFF", _dark: "#30302E" } },
          panel: { value: { _light: "#FFFFFF", _dark: "#30302E" } },
          // Fills of Chakra controls (switch track, subtle tabs, tags): one step away from the surfaces in both themes.
          subtle: { value: { _light: "#F5F4EF", _dark: "#2B2B29" } },
          muted: { value: { _light: "#F0EEE6", _dark: "#383835" } },
          emphasized: { value: { _light: "#E6E3D9", _dark: "#45453F" } },
        },
        // Chakra's borders (outline buttons, radio cards, inputs, menus) stay visible on the dark surfaces.
        border: {
          DEFAULT: { value: { _light: "#E6E3D9", _dark: "#45453F" } },
          subtle: { value: { _light: "#F0EEE6", _dark: "#383835" } },
          muted: { value: { _light: "#E6E3D9", _dark: "#3E3E3A" } },
          emphasized: { value: { _light: "#D1CFC5", _dark: "#5A5A54" } },
        },
        app: {
          canvas: { value: { base: "#FAF9F5", _dark: "#262624" } },
          surface: { value: { base: "#FFFFFF", _dark: "#30302E" } },
          sunken: { value: { base: "#F0EEE6", _dark: "#1F1E1D" } },
          border: { value: { base: "#E6E3D9", _dark: "#3E3E3A" } },
          ink: { value: { base: "#141413", _dark: "#FAF9F5" } },
          muted: { value: { base: "#5E5D59", _dark: "#B7B5A9" } },
          // Form field borders: >= 3:1 against canvas, surface and sunken (WCAG 1.4.11), ADR-0024.
          field: { value: { base: "#8A877D", _dark: "#807E74" } },
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
          grid: { value: { base: "#E6E3D9", _dark: "#3E3E3A" } },
          axis: { value: { base: "#5E5D59", _dark: "#B7B5A9" } },
          one: { value: { base: "{colors.brand.600}", _dark: "{colors.brand.300}" } },
          two: { value: { base: "{colors.saffron.700}", _dark: "{colors.saffron.300}" } },
        },
      },
      shadows: {
        card: { value: { base: "0 1px 2px rgba(20, 20, 19, 0.04), 0 2px 8px rgba(20, 20, 19, 0.04)", _dark: "0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)" } },
      },
      // Softer corners for every Chakra component (buttons, inputs, cards, menus).
      radii: {
        l1: { value: "0.375rem" },
        l2: { value: "0.5rem" },
        l3: { value: "0.75rem" },
      },
    },
    // ADR-0024: visible field boundaries (3:1) for text inputs, text areas and selects.
    recipes: {
      // Serif only for large headings (page titles); card and section titles stay in the sans body font.
      heading: { variants: { size: { xs: { fontFamily: "body" }, sm: { fontFamily: "body" }, md: { fontFamily: "body" }, lg: { fontFamily: "body" } } } },
      // Solid buttons darken on hover (Chakra lightens them, which drops white text under 4.5:1 on the clay accent).
      button: { variants: { variant: { solid: { _hover: { bg: "colorPalette.solid", filter: "brightness(0.92)" }, _expanded: { bg: "colorPalette.solid", filter: "brightness(0.92)" } } } } },
      input: { variants: { variant: { outline: { borderColor: "app.field" } } } },
      textarea: { variants: { variant: { outline: { borderColor: "app.field" } } } },
    },
    slotRecipes: {
      nativeSelect: { slots: ["root", "field", "indicator"], variants: { variant: { outline: { field: { borderColor: "app.field" } } } } },
      // Tabs keep their label on one line; a list wider than the screen scrolls inside its own frame (390 px).
      tabs: { slots: ["root", "list", "trigger", "content", "contentGroup", "indicator"], base: { trigger: { whiteSpace: "nowrap", flexShrink: 0 } } },
    },
  },
})

export const system = createSystem(defaultConfig, config)
