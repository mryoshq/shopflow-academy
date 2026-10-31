import { locale, msg, t } from "../i18n"
import { Box, Flex, Link, Stack, Text } from "@chakra-ui/react"
import type { DownloadDisplay } from "../studioTypes"

const TYPES: Record<string, string> = { pdf: "PDF", docx: "Word", zip: msg("Archive ZIP"), csv: "CSV", sql: "SQL", py: "Python", md: "Markdown" }

/** « 1,2 Mo », « 340 Ko » (French decimal comma). */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  const [value, unit] = bytes < 1024 * 1024 ? [bytes / 1024, "Ko"] : [bytes / (1024 * 1024), "Mo"]
  return `${value.toLocaleString(locale(), { maximumFractionDigits: value < 10 ? 1 : 0 })} ${unit}`
}

/** ADR-0032: course files, served by the API to signed-in users of the class only. */
export function Downloads({ data }: { data: DownloadDisplay }) {
  return <Stack as="section" gap="2" aria-label={data.title || t("Fichiers à télécharger")}>
    {data.title && <Text fontWeight="semibold">{data.title}</Text>}
    <Stack as="ul" listStyleType="none" p="0" m="0" gap="2">
      {data.files.map((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
        return <Flex as="li" key={file.id} gap="3" align="center" p="3" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface" wrap="wrap">
          <Box flexShrink={0} w="10" h="10" rounded="md" bg="brand.subtle" color="brand.fg" display="flex" alignItems="center" justifyContent="center" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 11v6M9 14l3 3 3-3" /></svg>
          </Box>
          <Stack gap="0" flex="1" minW="40">
            <Text fontWeight="semibold" overflowWrap="anywhere">{file.title}</Text>
            <Text fontSize="sm" color="app.muted">{t(TYPES[ext] ?? ext.toUpperCase())} · {fileSize(file.size)} · {file.name}</Text>
          </Stack>
          <Link href={`/api/v1/downloads/${encodeURIComponent(file.id)}`} download={file.name} minH="11" px="4" display="inline-flex" alignItems="center"
            rounded="md" bg="brand.solid" color="brand.contrast" fontWeight="semibold" _hover={{ textDecoration: "none", opacity: 0.92 }}
            aria-label={t("Télécharger {{title}} ({{p1}}, {{p2}})", { title: file.title, p1: t(TYPES[ext] ?? ext), p2: fileSize(file.size) })}>{t("Télécharger")}</Link>
        </Flex>
      })}
    </Stack>
  </Stack>
}
