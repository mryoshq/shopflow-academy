import { useRef } from "react"
import { Box, Button, Flex, chakra } from "@chakra-ui/react"
import type { ImageDisplay } from "../studioTypes"
import { RichText } from "./RichText"

/**
 * A course picture (ADR-0029): served by the gateway from /media/, alt text required, optional caption,
 * enlarged in a native modal dialog on click (Esc or « Fermer » closes it, focus comes back to the picture).
 * Pictures sit on a white plate in both themes, so a drawing with dark lines stays readable in dark mode.
 */
export function ImageView({ data }: { data: ImageDisplay }) {
  const dialog = useRef<HTMLDialogElement>(null)
  function open() {
    const element = dialog.current
    if (!element) return
    if (typeof element.showModal === "function") element.showModal()
    else element.setAttribute("open", "")
  }
  function close() {
    const element = dialog.current
    if (!element) return
    if (typeof element.close === "function") element.close()
    else element.removeAttribute("open")
  }
  return <Box as="figure" m="0">
    <chakra.button type="button" onClick={open} aria-label={`Agrandir l’image : ${data.alt}`} display="block" w="full" p="2" bg="white"
      borderWidth="1px" borderColor="app.border" rounded="lg" cursor="zoom-in" _hover={{ borderColor: "brand.solid" }}>
      <chakra.img src={data.src} alt={data.alt} loading="lazy" decoding="async" display="block" mx="auto" maxW="full" maxH={{ base: "60vh", md: "28rem" }} objectFit="contain" />
    </chakra.button>
    {data.caption && <Box as="figcaption" mt="2" fontSize="sm" color="app.muted"><RichText text={data.caption} /></Box>}
    <chakra.dialog ref={dialog} aria-label={data.alt} onClick={(event) => { if (event.target === event.currentTarget) close() }}
      p="0" border="0" bg="transparent" maxW="100vw" maxH="100vh" w="100vw" h="100dvh" m="0"
      css={{ "&::backdrop": { background: "rgba(10, 14, 13, 0.82)" } }}>
      <Flex direction="column" align="center" justify="center" gap="3" w="full" h="full" p={{ base: "3", md: "6" }}>
        <Box bg="white" p="2" rounded="lg" maxW="full" maxH="calc(100dvh - 7rem)" overflow="auto">
          <chakra.img src={data.src} alt={data.alt} display="block" maxW="min(96vw, 1400px)" maxH="calc(100dvh - 8rem)" objectFit="contain" />
        </Box>
        {data.caption && <Box color="white" fontSize="sm" textAlign="center"><RichText text={data.caption} /></Box>}
        <Button onClick={close} colorPalette="brand" minH="11" autoFocus>Fermer</Button>
      </Flex>
    </chakra.dialog>
  </Box>
}
