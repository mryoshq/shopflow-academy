/**
 * Original podium illustration (ADR-0026): three parcels stacked like a ShopFlow warehouse,
 * a flow line and a star, in theme colours. Decorative: the table carries the information.
 * The parcels rise once; nothing moves with prefers-reduced-motion.
 */
export function Podium({ width = 260 }: { width?: number }) {
  return <svg viewBox="0 0 260 150" width={width} height={(width * 150) / 260} aria-hidden="true" focusable="false" style={{ maxWidth: "100%", height: "auto" }}>
    <style>{`
      .podium-rise { animation: podium-rise 700ms cubic-bezier(.2,.8,.2,1) both; transform-box: fill-box; transform-origin: bottom; }
      .podium-rise.d2 { animation-delay: 120ms } .podium-rise.d3 { animation-delay: 240ms } .podium-star { animation: podium-pop 500ms 650ms ease-out both; transform-box: fill-box; transform-origin: center; }
      @keyframes podium-rise { from { transform: translateY(18px) scaleY(.6); opacity: 0 } to { transform: none; opacity: 1 } }
      @keyframes podium-pop { from { transform: scale(.4); opacity: 0 } to { transform: none; opacity: 1 } }
      @media (prefers-reduced-motion: reduce) { .podium-rise, .podium-star { animation: none } }
    `}</style>
    {/* Flow line behind the podium, like the logo's "S". */}
    <path d="M14 112 C 50 112, 52 70, 92 70 S 150 40, 196 44 S 236 30, 248 22" fill="none" stroke="var(--chakra-colors-brand-emphasized)" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" />
    <rect x="8" y="134" width="244" height="6" rx="3" fill="var(--chakra-colors-app-border)" />
    {/* 2nd place, left */}
    <g className="podium-rise d2">
      <rect x="36" y="86" width="60" height="48" rx="6" fill="var(--chakra-colors-brand-muted)" stroke="var(--chakra-colors-brand-solid)" strokeWidth="2" />
      <rect x="61" y="86" width="10" height="48" fill="var(--chakra-colors-brand-emphasized)" />
      <text x="66" y="121" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--chakra-colors-brand-fg)">2</text>
    </g>
    {/* 1st place, centre */}
    <g className="podium-rise">
      <rect x="100" y="60" width="60" height="74" rx="6" fill="var(--chakra-colors-brand-solid)" />
      <rect x="125" y="60" width="10" height="74" fill="var(--chakra-colors-saffron-300)" />
      <text x="130" y="112" textAnchor="middle" fontSize="24" fontWeight="700" fill="#FFFFFF" stroke="var(--chakra-colors-brand-solid)" strokeWidth="3" paintOrder="stroke">1</text>
    </g>
    {/* 3rd place, right */}
    <g className="podium-rise d3">
      <rect x="164" y="98" width="60" height="36" rx="6" fill="var(--chakra-colors-saffron-subtle)" stroke="var(--chakra-colors-saffron-solid)" strokeWidth="2" />
      <rect x="189" y="98" width="10" height="36" fill="var(--chakra-colors-saffron-muted)" />
      <text x="194" y="125" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--chakra-colors-saffron-fg)">3</text>
    </g>
    <path className="podium-star" d="M130 18l5.3 10.8 11.9 1.7-8.6 8.4 2 11.8L130 45.1l-10.6 5.6 2-11.8-8.6-8.4 11.9-1.7z" fill="var(--chakra-colors-saffron-300)" stroke="var(--chakra-colors-saffron-solid)" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
}
