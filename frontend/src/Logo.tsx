/** ShopFlow Academy monogram (same drawing as public/icons/favicon.svg), in theme colours. */
export function Logo({ size = 32 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <rect width="64" height="64" rx="14" fill="var(--chakra-colors-brand-solid)" />
    <path d="M43 19H27.5a7.5 7.5 0 0 0 0 15h9a7.5 7.5 0 0 1 0 15H20" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="47" cy="49" r="4" fill="var(--chakra-colors-saffron-300)" />
  </svg>
}
