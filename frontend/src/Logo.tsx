import { Image } from "@chakra-ui/react"

/** Owner's logo (docs/design/README.md): full logo in the light theme, green variant in the dark theme.
 *  Decorative: the name « ShopFlow Academy » is always written next to it. */
export function Logo({ size = 36 }: { size?: number }) {
  // Pixel strings: a bare number would be read as a Chakra size token (32 = 8rem).
  const px = `${size}px`
  return <>
    <Image src="/icons/logo-light.png" alt="" width={px} height={px} display={{ base: "block", _dark: "none" }} flexShrink={0} />
    <Image src="/icons/logo-dark.png" alt="" width={px} height={px} display={{ base: "none", _dark: "block" }} flexShrink={0} />
  </>
}
