import { t } from "../i18n"
import { Box, Link, Text } from "@chakra-ui/react"
import type { ExperienceDisplay } from "../studioTypes"
import { VOYAGE_READY } from "../voyage"
import { CAMPUSEQUIP_READY } from "../campusequip"
import { useStudentHref } from "../useHashRoute"

/** A lesson opens an experience at its starting scene: « Le voyage d'une donnée » (ADR-0033) or CampusEquip (ADR-0044). */
export function ExperienceCard({ data }: { data: ExperienceDisplay }) {
  const campus = data.experience === "campusequip"
  const title = data.title || (campus ? t("Le voyage d’une location") : t("Le voyage d’une donnée"))
  const ready = campus ? CAMPUSEQUIP_READY : VOYAGE_READY
  const href = useStudentHref()
  const path = campus ? `/campusequip/${data.scene ?? 1}` : `/voyage/${data.scene ?? 1}`
  return <Box as="section" aria-label={title} p="4" borderWidth="1px" borderColor="brand.solid" borderLeftWidth="4px" rounded="lg" bg="brand.subtle">
    <Text fontWeight="semibold">{title}</Text>
    <Text fontSize="sm" color="app.muted" mt="1">{t("Expérience interactive")}{data.scene ? (campus ? t(", à partir de l’étape {{scene}}", { scene: data.scene }) : t(", à partir de la scène {{scene}}", { scene: data.scene })) : ""}.</Text>
    {ready
      ? <Link href={href(path)} mt="3" display="inline-flex" alignItems="center" minH="11" px="4" rounded="md" bg="brand.solid" color="brand.contrast"
        fontWeight="semibold" _hover={{ textDecoration: "none" }}>{t("Ouvrir l’expérience")}</Link>
      : <Text fontSize="sm" mt="2">{t("Bientôt disponible dans l’Academy.")}</Text>}
  </Box>
}
