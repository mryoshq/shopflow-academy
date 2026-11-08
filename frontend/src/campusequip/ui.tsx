import { useEffect, type ReactNode, type RefObject } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { Portal, Text, Tooltip } from "@chakra-ui/react";

/** Tooltip rendered inside the experience (presentation mode keeps it). */
export function Tip({ label, container, children, placement = "bottom" }: { label: string; container: RefObject<HTMLDivElement | null>; children: ReactNode; placement?: "bottom" | "top" }) {
  return (
    <Tooltip.Root openDelay={250} closeDelay={50} positioning={{ placement }}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Portal container={container}>
        <Tooltip.Positioner>
          <Tooltip.Content fontSize="xs" px="2" py="1" maxW="18rem">
            {label}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

export const Kicker = ({ children, color = "brand.fg" }: { children: ReactNode; color?: string }) => (
  <Text textStyle="overline" fontSize="2xs" color={color} letterSpacing="0.12em" truncate>
    {children}
  </Text>
);

/** A number that eases from its previous value (rising values may wait for an animation to land). */
export function Count({ value, format, reduced, delay = 0 }: { value: number; format?: (n: number) => string; reduced?: boolean; delay?: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => (format ? format(Math.round(v)) : String(Math.round(v))));
  useEffect(() => {
    const wait = reduced || value < mv.get() ? 0 : delay;
    const c = animate(mv, value, { duration: reduced ? 0 : 0.9, delay: wait, ease: [0.2, 0.7, 0.2, 1] });
    return () => c.stop();
    // only a new value animates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mv, value, reduced]);
  return <motion.span>{text}</motion.span>;
}

