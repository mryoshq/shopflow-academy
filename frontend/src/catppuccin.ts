import { defineConfig } from "@chakra-ui/react"

/** Official Latte/Mocha colours (MIT): https://catppuccin.com/palette/ */
export const CATPPUCCIN = {
  latte: { base: "#EFF1F5", mantle: "#E6E9EF", crust: "#DCE0E8", text: "#4C4F69", subtext: "#5C5F77", field: "#6C6F85", surface: "#BCC0CC", mauve: "#8839EF" },
  mocha: { base: "#1E1E2E", mantle: "#181825", crust: "#11111B", text: "#CDD6F4", subtext: "#BAC2DE", field: "#9399B2", surface: "#313244", mauve: "#CBA6F7" },
} as const
const l = CATPPUCCIN.latte, d = CATPPUCCIN.mocha
const pair = (light: string, dark: string) => ({ value: { _catppuccinLight: light, _catppuccinDark: dark } })

/** Conditional semantic tokens supplement the existing theme; the default palette is untouched. */
export const catppuccinConfig = defineConfig({
  conditions: {
    catppuccinLight: "&:is([data-palette=catppuccin].light, [data-palette=catppuccin].light *)",
    catppuccinDark: "&:is([data-palette=catppuccin].dark, [data-palette=catppuccin].dark *)",
  },
  theme: { semanticTokens: { colors: {
    app: { canvas: pair(l.base, d.base), surface: pair(l.base, d.surface), sunken: pair(l.mantle, d.mantle), border: pair(l.surface, "#585B70"), ink: pair(l.text, d.text), muted: pair(l.subtext, d.subtext), field: pair(l.field, d.field) },
    brand: { solid: pair(l.mauve, d.mauve), contrast: pair("#FFFFFF", d.base), fg: pair(l.text, d.mauve), subtle: pair(l.mantle, d.mantle), muted: pair(l.crust, d.surface), emphasized: pair(l.crust, "#45475A"), border: pair(l.field, d.field), focusRing: pair(l.mauve, d.mauve) },
    gray: { subtle: pair(l.mantle, d.mantle), muted: pair(l.crust, d.surface), emphasized: pair(l.surface, "#45475A"), border: pair(l.field, d.field) },
    bg: { DEFAULT: pair(l.base, d.surface), panel: pair(l.base, d.surface), subtle: pair(l.mantle, d.mantle), muted: pair(l.crust, d.surface), emphasized: pair(l.surface, "#45475A") },
    fg: { DEFAULT: pair(l.text, d.text), muted: pair(l.subtext, d.subtext), subtle: pair(l.subtext, d.subtext), inverted: pair(l.base, d.base) },
    border: { DEFAULT: pair(l.field, d.field), subtle: pair(l.surface, "#585B70"), muted: pair(l.surface, "#585B70"), emphasized: pair(l.field, d.field) },
    hero: { bg: pair(d.base, d.crust), ink: pair(d.text, d.text), muted: pair(d.subtext, d.subtext), accent: pair(d.mauve, d.mauve), border: pair("#585B70", "#585B70") },
    chart: { grid: pair(l.surface, "#585B70"), axis: pair(l.subtext, d.subtext), one: pair(l.mauve, d.mauve), two: pair(l.text, "#F9E2AF") },
  } } },
})
