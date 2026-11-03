import { Component, type ReactNode } from "react"
import { Box, Button, Text } from "@chakra-ui/react"
import { t } from "../i18n"

/** A rejected lazy module must stay inside the preview, leaving its download and close controls usable. */
export class PdfLoadBoundary extends Component<{ children: ReactNode; onReload: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <Box role="status">
      <Text>{t("Le lecteur PDF n’a pas pu être chargé. Rechargez la page pour réessayer.")}</Text>
      {/* Browsers cache failed ESM imports; a new document reliably resets that module cache. */}
      <Button mt="2" variant="outline" onClick={this.props.onReload}>{t("Recharger la page")}</Button>
    </Box>
  }
}
