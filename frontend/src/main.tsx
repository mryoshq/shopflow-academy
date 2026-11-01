import React from "react"
import ReactDOM from "react-dom/client"
import { ChakraProvider } from "@chakra-ui/react"
// ADR-0048: Space Grotesk (SIL OFL 1.1), bundled and served by the Academy (no font CDN).
import "@fontsource-variable/space-grotesk"
import { App } from "./App"
import { PwaBanner } from "./pwa"
import { system } from "./theme"
import { applyLanguage, useLanguage } from "./i18n"

/** ADR-0040: a language change renders the whole interface again in the new language (the hash route is kept). */
function Root() {
  const lang = useLanguage()
  return <ChakraProvider value={system}>
    <App key={lang} />
    <PwaBanner key={`pwa-${lang}`} />
  </ChakraProvider>
}

applyLanguage()
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
