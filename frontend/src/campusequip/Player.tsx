import type { RefObject } from "react";
import { Box, Button, Flex, HStack, IconButton, Menu, NativeSelect, Portal, Text } from "@chakra-ui/react";
import { scenarios, type Scenario } from "./model";
import { chapters, pad, type Modal, type Step } from "./content";
import { Icon } from "./icons";

export interface PlayerProps {
  steps: Step[];
  index: number;
  playing: boolean;
  /** A step waits for an action (« Reprendre le traitement »). */
  blocked: boolean;
  speed: number;
  dwell: number;
  reduced: boolean;
  width: number;
  /** Phones and touch screens: every button is 44 px (ADR-0029). */
  touch: boolean;
  full: boolean;
  /** Rafi floats over the bottom-right corner of the student pages: the bar leaves it room. */
  docked: boolean;
  container: RefObject<HTMLDivElement | null>;
  onRestart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
  onGo: (n: number) => void;
  onSpeed: (s: number) => void;
  onReduced: () => void;
  onFullscreen: () => void;
  /** Phones with little height: the scenario, the panel and the reference dialogs move into the menu. */
  more?: {
    scenario: Scenario | null;
    onScenario: (s: Scenario) => void;
    onInspect: () => void;
    onOpen: (m: Exclude<Modal, null>) => void;
  };
}

const SPEEDS = [0.5, 1, 1.5, 2];

export function Player(p: PlayerProps) {
  const step = p.steps[p.index];
  const last = p.index === p.steps.length - 1;
  const md = p.width >= 768;
  const lg = p.width >= 1024;
  const playable = !step.explore;
  const endOfPlay = !p.steps[p.index + 1] || !!p.steps[p.index + 1].explore;
  const hint = step.explore ? "Explorez les interactions de cette étape" : p.blocked ? "Reprenez le traitement pour continuer" : p.playing ? "Le voyage est en cours" : "Espace ou flèches pour avancer";
  const cls = (i: number) => "tick" + (i < p.index ? " past" : i === p.index ? " now" : "") + (i > 0 && p.steps[i].scene !== p.steps[i - 1].scene ? " gap" : "") + (p.steps[i].explore ? " explore" : "");
  const fill = (i: number) => (i === p.index && p.playing && !p.blocked && !endOfPlay ? <i key={p.index + "-" + p.dwell} className="tick-fill" style={{ animationDuration: p.dwell + "ms" }} /> : null);

  return (
    <Flex as="footer" className="ce-player" align="center" gap={md ? "2" : "1.5"} ps={md ? "3" : "2"} pe={p.docked ? (md ? "24" : "20") : md ? "3" : "2"} h={md ? "64px" : "60px"} flexShrink={0} bg="app.surface" borderTopWidth="1px" borderColor="app.border">
      {p.width >= 480 && (
        <IconButton aria-label="Recommencer le scénario" size="sm" variant="outline" onClick={p.onRestart}>
          <Icon name="reset" size={15} />
        </IconButton>
      )}
      <IconButton aria-label="Étape précédente" size="sm" variant="outline" onClick={p.onPrev} disabled={p.index === 0}>
        <Icon name="back" size={15} />
      </IconButton>
      <Button size="sm" colorPalette="brand" minW={md ? "28" : "10"} px={md ? "4" : "2"} onClick={p.onToggle} disabled={p.blocked || !playable} aria-label={p.playing ? "Pause" : "Lecture"}>
        <Icon name={p.playing ? "pause" : "play"} size={14} />
        {md && <Box as="span">{p.playing ? "Pause" : endOfPlay && playable ? "Rejouer" : "Lecture"}</Box>}
      </Button>
      <IconButton aria-label="Étape suivante" size="sm" variant="outline" onClick={p.onNext} disabled={last || p.blocked}>
        <Icon name="chevron" size={15} />
      </IconButton>

      <Box flex="1" minW="0" px={md ? "2" : "1"}>
        <Flex justify="space-between" gap="3" align="baseline">
          <Text fontSize="xs" fontWeight="bold" truncate>
            {pad(step.scene + 1)} · {chapters[step.scene].title}
            <Text as="span" color="app.muted" fontWeight="normal">
              {" "}
              · {pad(p.index + 1)}/{pad(p.steps.length)}
            </Text>
          </Text>
          {md && (
            <Text fontSize="2xs" color="app.muted" truncate>
              {hint}
            </Text>
          )}
        </Flex>
        {p.touch ? (
          // Twelve 44 px buttons cannot fit a phone: the timeline is a progress bar here.
          <Flex gap="3px" mt="1.5" h="14px" align="center" aria-hidden="true">
            {p.steps.map((s, i) => (
              <span key={s.key} className={cls(i)}>
                <span className="bar">{fill(i)}</span>
              </span>
            ))}
          </Flex>
        ) : (
          <Flex gap="3px" mt="1.5" h="14px" align="center">
            {p.steps.map((s, i) => (
              <button key={s.key} type="button" className={cls(i)} onClick={() => p.onGo(i)} aria-label={`Séquence ${i + 1} : ${s.title}`} aria-current={i === p.index ? "step" : undefined} title={s.title}>
                <span className="bar">{fill(i)}</span>
              </button>
            ))}
          </Flex>
        )}
      </Box>

      {lg && (
        <HStack gap="2">
          <NativeSelect.Root size="xs" w="16">
            <NativeSelect.Field aria-label="Vitesse de lecture" value={String(p.speed)} onChange={(e) => p.onSpeed(Number(e.currentTarget.value))}>
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <IconButton size="xs" variant={p.reduced ? "solid" : "outline"} colorPalette="brand" onClick={p.onReduced} aria-pressed={p.reduced} aria-label="Réduire les animations" title="Réduire les animations">
            <Icon name="eye" size={14} />
          </IconButton>
          <Button size="xs" variant="outline" onClick={p.onFullscreen} aria-label={p.full ? "Quitter le mode présentation" : "Mode présentation (plein écran)"}>
            <Icon name="expand" size={13} /> {p.full ? "Quitter" : "Présentation"}
          </Button>
        </HStack>
      )}

      {!lg && (
        <Menu.Root positioning={{ placement: "top-end" }}>
          <Menu.Trigger asChild>
            <IconButton size="sm" variant="outline" aria-label="Options de lecture">
              <Icon name="menu" size={15} />
            </IconButton>
          </Menu.Trigger>
          <Portal container={p.container}>
            <Menu.Positioner>
              <Menu.Content minW="14rem" maxH="min(32rem, 80dvh)" overflowY="auto">
                {p.more && (
                  <>
                    {p.more.scenario && (
                      <>
                        <Menu.ItemGroup>
                          <Menu.ItemGroupLabel>Scénario</Menu.ItemGroupLabel>
                          <Menu.RadioItemGroup value={p.more.scenario} onValueChange={(e) => p.more?.onScenario(e.value as Scenario)}>
                            {scenarios.map((s) => (
                              <Menu.RadioItem key={s.id} value={s.id}>
                                {s.label}
                                <Menu.ItemIndicator />
                              </Menu.RadioItem>
                            ))}
                          </Menu.RadioItemGroup>
                        </Menu.ItemGroup>
                        <Menu.Separator />
                      </>
                    )}
                    <Menu.Item value="inspect" onClick={p.more.onInspect}>
                      <Icon name="search" size={14} /> Comprendre le détail
                    </Menu.Item>
                    <Menu.Item value="glossary" onClick={() => p.more?.onOpen("glossary")}>
                      <Icon name="book" size={14} /> Glossaire
                    </Menu.Item>
                    <Menu.Item value="sources" onClick={() => p.more?.onOpen("sources")}>
                      <Icon name="file" size={14} /> Sources et sujet
                    </Menu.Item>
                    <Menu.Separator />
                  </>
                )}
                <Menu.ItemGroup>
                  <Menu.ItemGroupLabel>Vitesse</Menu.ItemGroupLabel>
                  <Menu.RadioItemGroup value={String(p.speed)} onValueChange={(e) => p.onSpeed(Number(e.value))}>
                    {SPEEDS.map((s) => (
                      <Menu.RadioItem key={s} value={String(s)}>
                        {s}×
                        <Menu.ItemIndicator />
                      </Menu.RadioItem>
                    ))}
                  </Menu.RadioItemGroup>
                </Menu.ItemGroup>
                <Menu.Separator />
                <Menu.CheckboxItem value="reduced" checked={p.reduced} onCheckedChange={p.onReduced}>
                  Réduire les animations
                  <Menu.ItemIndicator />
                </Menu.CheckboxItem>
                {md && (
                  <Menu.Item value="full" onClick={p.onFullscreen}>
                    <Icon name="expand" size={14} /> {p.full ? "Quitter le mode présentation" : "Mode présentation"}
                  </Menu.Item>
                )}
                <Menu.Item value="restart" onClick={p.onRestart}>
                  <Icon name="reset" size={14} /> Recommencer le scénario
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      )}
    </Flex>
  );
}
