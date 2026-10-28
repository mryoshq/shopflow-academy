import React from "react"
import ReactDOM from "react-dom/client"
import { ChakraProvider } from "@chakra-ui/react"
import { App } from "./App"
import { PwaBanner } from "./pwa"
import { system } from "./theme"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ChakraProvider value={system}>
      <App />
      <PwaBanner />
    </ChakraProvider>
  </React.StrictMode>,
)
