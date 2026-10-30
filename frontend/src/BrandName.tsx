import { Box, Text } from "@chakra-ui/react"

/** ADR-0037: the school, its module and the module's case studies (the subdomain stays shopflow.rapidfox.io). */
export const SCHOOL = "Rapidfox Academy"
export const MODULE = "Python Data Engineering & SQL Avancé"
export const CASES = "ShopFlow · CampusEquip"

export function SchoolName({ large = false }: { large?: boolean }) {
  return <Text fontWeight="bold" fontSize={large ? "xl" : "md"} letterSpacing="0.01em" whiteSpace="nowrap" lineHeight="1.2">
    Rapidfox <Text as="span" color="brand.fg">Academy</Text></Text>
}

/**
 * School name with the module under it; the case studies are secondary text, left out on a phone.
 * `size="lg"` (login card) puts the case studies on their own line.
 */
export function BrandName({ size = "md" }: { size?: "md" | "lg" }) {
  const large = size === "lg"
  return <Box minW="0">
    <SchoolName large={large} />
    <Text fontSize={large ? "sm" : "xs"} color="app.muted" mt="0.5" lineHeight="1.35">
      {MODULE}
      {!large && <Text as="span" display={{ base: "none", md: "inline" }}> · {CASES}</Text>}
    </Text>
    {large && <Text fontSize="xs" color="app.muted" mt="0.5" display={{ base: "none", sm: "block" }}>Cas d’étude : {CASES}</Text>}
  </Box>
}
