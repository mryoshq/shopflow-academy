import { t } from "../i18n"
import { useId, type ReactNode } from "react"
import { Box, Flex, Grid, Stack, Text } from "@chakra-ui/react"
import type { DisplayData, StudentDefinition } from "../studioTypes"

export type LessonFields = Pick<StudentDefinition, "body" | "objective" | "hook" | "key_terms" | "example" | "practice">
import { Inline, RichText } from "./RichText"
import { Icon } from "./ui"

/**
 * Structured lesson (ADR-0022), in reading order: objective (discreet banner), hook,
 * vocabulary cards, free text, worked example, media, "À vous". Every part is optional;
 * an old lesson with only ``body`` renders exactly its text.
 */
export function LessonView({ definition, media, headingAs = "h2" }: { definition: LessonFields; media: ReactNode; headingAs?: "h2" | "h3" | "h4" | "h5" }) {
  const terms = definition.key_terms ?? []
  const id = useId()
  return <Stack gap="5">
    {definition.objective && <Flex as="p" m="0" gap="2" align="start" px="3" py="2" rounded="md" bg="brand.subtle" color="brand.fg" fontSize="sm" maxW="72ch">
      <Box as="span" mt="0.5" flexShrink={0}><Icon name="target" size={16} /></Box>
      <span><Text as="span" fontWeight="semibold">{t("Objectif :")}{" "}</Text>{definition.objective}</span>
    </Flex>}
    {definition.hook && <RichText text={definition.hook} fontSize={{ base: "lg", md: "xl" }} />}
    {terms.length > 0 && <Box as="section" aria-labelledby={`${id}-terms`}>
      <Text id={`${id}-terms`} fontSize="sm" fontWeight="semibold" color="app.muted" mb="2">{t("Vocabulaire")}</Text>
      <Grid as="dl" m="0" gap="3" templateColumns={{ base: "1fr", sm: "repeat(auto-fill, minmax(14rem, 1fr))" }}>
        {terms.map((item) => <Box key={item.term} p="3" rounded="lg" borderWidth="1px" borderColor="app.border" bg="app.sunken">
          <Text as="dt" fontWeight="semibold" color="brand.fg">{item.term}</Text>
          <Text as="dd" m="0" mt="1" fontSize="sm"><Inline text={item.definition} /></Text>
        </Box>)}
      </Grid>
    </Box>}
    {definition.body && <RichText text={definition.body} headings headingAs={headingAs} fontSize="lg" />}
    {definition.example && <Box as="section" aria-labelledby={`${id}-example`} p="4" rounded="lg" borderWidth="1px" borderColor="app.border" borderLeftWidth="4px" borderLeftColor="brand.solid" bg="app.surface">
      <Flex id={`${id}-example`} gap="2" align="center" fontWeight="semibold" mb="2" color="brand.fg"><Icon name="check" size={16} />{t("Exemple résolu")}</Flex>
      <RichText text={definition.example} />
    </Box>}
    {media}
    {definition.practice && <Box as="section" aria-labelledby={`${id}-practice`} p="4" rounded="lg" bg="saffron.subtle" borderWidth="1px" borderColor="saffron.solid">
      <Flex id={`${id}-practice`} gap="2" align="center" fontWeight="semibold" mb="2" color="saffron.fg"><Icon name="pencil" size={16} />{t("À vous")}</Flex>
      <RichText text={definition.practice} />
    </Box>}
  </Stack>
}

/**
 * Wraps a media: its ``description`` is never shown on screen. Screen readers get it through
 * ``aria-describedby`` on a visually hidden text.
 */
export function DescribedMedia({ data, children }: { data: DisplayData | null; children: ReactNode }) {
  const id = useId()
  const description = data?.description?.trim()
  if (!data || !description) return <>{children}</>
  const descriptionId = `${id}-description`
  return <Box role="group" aria-label={"title" in data && data.title ? t("Média : {{title}}", { title: data.title }) : t("Média")} aria-describedby={descriptionId}>
    {children}
    <Box id={descriptionId} srOnly><RichText text={description} gap="2" /></Box>
  </Box>
}
