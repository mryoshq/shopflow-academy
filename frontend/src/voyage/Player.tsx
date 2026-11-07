import type { RefObject } from "react";
import { Box, Button, Flex, HStack, IconButton, Menu, NativeSelect, Portal, SegmentGroup, Text } from "@chakra-ui/react";
import { Icon } from "./icons";
import { scenes, type Frame, type Scenario } from "./model";
import { scenarios, type Modal, type Mode } from "./content";

export interface PlayerProps {
  frames: Frame[];
  index: number;
  playing: boolean;
  blocked: boolean;
  speed: number;
  dwell: number;
  reduced: boolean;
  mode: Mode;
  follow: boolean;
  /** Width of the experience (its host may add a sidebar). */
  width: number;
  /** Phones and touch screens: the Academy gives every button 44 px (ADR-0029). */
  touch: boolean;
  /** Rafi floats over the bottom-right corner of the student pages. */
  docked: boolean;
  container: RefObject<HTMLDivElement | null>;
  onRestart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
  onGo: (n: number) => void;
  onSpeed: (s: number) => void;
  onMode: (m: Mode) => void;
  onFollow: () => void;
  onReduced: () => void;
  /** Phones with little height: the scenario, the inspector and the reference dialogs move into the menu. */
  more?: {
    scenario: Scenario;
    onScenario: (s: Scenario) => void;
    onInspect: () => void;
    onQuestion: () => void;
    onOpen: (m: Exclude<Modal, null | "file" | "question">) => void;
  };
}

const SPEEDS = [0.5, 1, 1.5, 2];

export function Player(p: PlayerProps) {
  const frame = p.frames[p.index];
  const last = p.index === p.frames.length - 1;
  const md = p.width >= 768;
  const lg = p.width >= 1024;
  const hint = p.playing ? "Le voyage est en cours" : p.blocked ? "Une action est nécessaire" : last ? "Fin du parcours" : "Espace ou flèches pour avancer";
  const cls = (i: number, f: Frame) => "tick" + (i < p.index ? " past" : i === p.index ? " now" : "") + (i > 0 && f.scene !== p.frames[i - 1].scene ? " gap" : "");
  const fill = (i: number) =>
    i === p.index && !last && p.playing && !p.blocked ? <i key={p.index + "-" + p.dwell} className="tick-fill" style={{ animationDuration: p.dwell + "ms" }} /> : null;

  return (
    <Flex
      as="footer"
      className="voyage-player"
      align="center"
      gap={md ? "2" : "1.5"}
      ps={md ? "3" : "2"}
      pe={p.docked ? (md ? "24" : "20") : md ? "3" : "2"}
      h={md ? "64px" : "60px"}
      flexShrink={0}
      bg="app.surface"
      borderTopWidth="1px"
      borderColor="app.border"
    >
      {p.width >= 480 && (
        <IconButton aria-label="Recommencer" size="sm" variant="outline" onClick={p.onRestart}>
          <Icon name="reset" size={15} />
        </IconButton>
      )}
      <IconButton aria-label="Étape précédente" size="sm" variant="outline" onClick={p.onPrev} disabled={p.index === 0}>
        <Icon name="back" size={15} />
      </IconButton>
      <Button size="sm" colorPalette="brand" minW={md ? "28" : "10"} px={md ? "4" : "2"} onClick={p.onToggle} disabled={p.blocked} aria-label={p.playing ? "Pause" : "Lecture"}>
        <Icon name={p.playing ? "pause" : "play"} size={14} />
        {md && <Box as="span">{p.playing ? "Pause" : last ? "Rejouer" : "Lecture"}</Box>}
      </Button>
      <IconButton aria-label="Étape suivante" size="sm" variant="outline" onClick={p.onNext} disabled={last || p.blocked}>
        <Icon name="chevron" size={15} />
      </IconButton>

      <Box flex="1" minW="0" px={md ? "2" : "1"}>
        <Flex justify="space-between" gap="3" align="baseline">
          <Text fontSize="xs" fontWeight="bold" truncate>
            {String(p.index + 1).padStart(2, "0")} / {String(p.frames.length).padStart(2, "0")} · {scenes[frame.scene].title}
          </Text>
          {md && (
            <Text fontSize="2xs" color="app.muted" truncate>
              {hint}
            </Text>
          )}
        </Flex>
        {p.touch ? (
          // 15 buttons of 44 px cannot fit a phone: the timeline is a progress bar here,
          // and the previous / next buttons and the scene buttons do the navigation.
          <Flex gap="3px" mt="1.5" h="14px" align="center" aria-hidden="true">
            {p.frames.map((f, i) => (
              <span key={f.id} className={cls(i, f)}>
                <span className="bar">{fill(i)}</span>
              </span>
            ))}
          </Flex>
        ) : (
          <Flex gap="3px" mt="1.5" h="14px" align="center">
            {p.frames.map((f, i) => (
              <button key={f.id} type="button" className={cls(i, f)} onClick={() => p.onGo(i)} aria-label={`Étape ${i + 1} : ${f.title}`} aria-current={i === p.index ? "step" : undefined} title={f.title}>
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
          <SegmentGroup.Root size="xs" value={p.mode} onValueChange={(e) => e.value && p.onMode(e.value as Mode)} aria-label="Mode de visite">
            <SegmentGroup.Indicator />
            <SegmentGroup.Items
              items={[
                { value: "guided", label: "Guidée" },
                { value: "free", label: "Libre" },
              ]}
            />
          </SegmentGroup.Root>
          <Button size="xs" variant={p.follow ? "solid" : "outline"} colorPalette="brand" onClick={p.onFollow} aria-pressed={p.follow}>
            #1001
          </Button>
          <IconButton size="xs" variant={p.reduced ? "solid" : "outline"} colorPalette="brand" onClick={p.onReduced} aria-pressed={p.reduced} aria-label="Animations réduites" title="Animations réduites">
            <Icon name="pause" size={13} />
          </IconButton>
        </HStack>
      )}

      {!lg && (
        <Menu.Root positioning={{ placement: "top-end" }}>
          <Menu.Trigger asChild>
            <IconButton size="sm" variant="outline" aria-label="Options de lecture">
              <Icon name="layers" size={15} />
            </IconButton>
          </Menu.Trigger>
          <Portal container={p.container}>
            <Menu.Positioner>
              <Menu.Content minW="13rem" maxH="min(32rem, 80dvh)" overflowY="auto">
                {p.more && (
                  <>
                    <Menu.ItemGroup>
                      <Menu.ItemGroupLabel>Scénario</Menu.ItemGroupLabel>
                      <Menu.RadioItemGroup value={p.more.scenario} onValueChange={(e) => p.more?.onScenario(e.value as Scenario)}>
                        {scenarios.map((s) => (
                          <Menu.RadioItem key={s.id} value={s.id}>
                            {s.title}
                            <Menu.ItemIndicator />
                          </Menu.RadioItem>
                        ))}
                      </Menu.RadioItemGroup>
                    </Menu.ItemGroup>
                    <Menu.Separator />
                    <Menu.Item value="inspect" onClick={p.more.onInspect}>
                      <Icon name="search" size={14} /> À la loupe
                    </Menu.Item>
                    <Menu.Item value="question" onClick={p.more.onQuestion}>
                      <Icon name="book" size={14} /> Prenez un instant
                    </Menu.Item>
                    <Menu.Item value="architecture" onClick={() => p.more?.onOpen("architecture")}>
                      <Icon name="layers" size={14} /> Architecture
                    </Menu.Item>
                    <Menu.Item value="glossary" onClick={() => p.more?.onOpen("glossary")}>
                      <Icon name="book" size={14} /> Glossaire
                    </Menu.Item>
                    <Menu.Item value="about" onClick={() => p.more?.onOpen("about")}>
                      <Icon name="info" size={14} /> À propos de la simulation
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
                <Menu.CheckboxItem value="free" checked={p.mode === "free"} onCheckedChange={() => p.onMode(p.mode === "free" ? "guided" : "free")}>
                  Exploration libre
                  <Menu.ItemIndicator />
                </Menu.CheckboxItem>
                <Menu.CheckboxItem value="follow" checked={p.follow} onCheckedChange={p.onFollow}>
                  Suivre #1001
                  <Menu.ItemIndicator />
                </Menu.CheckboxItem>
                <Menu.CheckboxItem value="reduced" checked={p.reduced} onCheckedChange={p.onReduced}>
                  Animations réduites
                  <Menu.ItemIndicator />
                </Menu.CheckboxItem>
                <Menu.Separator />
                <Menu.Item value="restart" onClick={p.onRestart}>
                  <Icon name="reset" size={14} /> Recommencer
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      )}
    </Flex>
  );
}
