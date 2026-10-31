import { language } from "./index"

/**
 * Notifications are written in French by the server (ADR-0023). In another language, the known
 * automatic texts are rendered from their French template; a teacher's own message, or any text
 * that matches no template, is shown as written.
 */
type Rule = [RegExp, (...parts: string[]) => string]
const EN: Rule[] = [
  [/^Le bloc « (.+) » est ouvert pour vous\.$/, (title) => `Block “${title}” is open for you.`],
  [/^Le bloc « (.+) » est ouvert\.$/, (title) => `Block “${title}” is open.`],
  [/^Votre demande d’aide sur « (.+) » a été prise en compte\.$/, (title) => `Your help request on “${title}” has been handled.`],
  [/^(.+) semble bloqué sur « (.+) » \((\d+) essais\)\.$/, (name, title, n) => `${name} seems stuck on “${title}” (${n} attempts).`],
  [/^(.+) demande de l’aide sur « (.+) »\.$/, (name, title) => `${name} is asking for help on “${title}”.`],
  [/^Ouverture automatique : « (.+) » est ouvert\.$/, (title) => `Automatic opening: “${title}” is open.`],
  [/^Dans 2 min : ouverture automatique de « (.+) »\.$/, (title) => `In 2 min: automatic opening of “${title}”.`],
  [/^« (.+) » terminé par (\d+) étudiants? sur (\d+) \((\d+) %\)\.$/, (title, done, total, percent) =>
    `“${title}” finished by ${done} student${done === "1" ? "" : "s"} out of ${total} (${percent} %).`],
  [/^Nouveau badge : (.+)$/, (label) => `New badge: ${rewardText(label)}`],
  [/^Objectif de classe atteint : (.+)\. Bravo à toutes et à tous !$/, (text) => `Class goal reached: ${lowerFirst(rewardText(capitalFirst(text)))}. Well done, everyone!`],
  [/^Objectif de classe : (\d+) % ! (.+)\. Continuez ensemble\.$/, (percent, text) => `Class goal: ${percent} %! ${rewardText(text)}. Keep going together.`],
  [/^(.+) semble déconnecté \(vu il y a (\d+) min\)\.$/, (name, minutes) => `${name} seems disconnected (seen ${minutes} min ago).`],
]

export function serverText(text: string, kind?: string): string {
  if (language() === "fr" || kind === "message") return text
  for (const [pattern, render] of EN) {
    const match = pattern.exec(text)
    if (match) return render(...match.slice(1))
  }
  return text
}

/**
 * ADR-0039: badge names, hints, level names and the class goal sentence come from the server in
 * French. The fixed ones are translated here; a badge named after an objective or a module keeps
 * that name, which is course content.
 */
const REWARDS_EN: Record<string, string> = {
  "Stagiaire Data": "Data Intern", "Analyste Junior": "Junior Analyst", "Analyste Data": "Data Analyst",
  "Data Engineer Junior": "Junior Data Engineer", "Data Engineer": "Data Engineer", "Data Engineer Confirmé": "Experienced Data Engineer",
  "Senior Data Engineer": "Senior Data Engineer", "Lead Data Engineer": "Lead Data Engineer",
  "Première mission réussie": "First mission passed", "Premier bloc terminé": "First block finished",
  "Série de 5": "Streak of 5", "Série de 10": "Streak of 10",
  "Réussir une mission.": "Pass a mission.", "Terminer toutes les missions d’un bloc.": "Finish every mission in a block.",
  "Réussir 5 missions de suite du premier coup.": "Pass 5 missions in a row on the first try.",
  "Réussir 10 missions de suite du premier coup.": "Pass 10 missions in a row on the first try.",
  "Réussir toutes les missions de cet objectif.": "Pass every mission of this objective.",
  "Réussir tous les bonus de ce module.": "Pass every bonus of this module.",
}
const REWARD_RULES: Rule[] = [
  [/^Objectif atteint : (.+)$/s, (name) => `Objective reached: ${name}`],
  [/^Tous les bonus : (.+)$/s, (name) => `All bonuses: ${name}`],
  [/^La classe a réussi (\d+) missions? sur (\d+)$/, (n, target) => `The class has passed ${n} mission${n === "1" || n === "0" ? "" : "s"} out of ${target}`],
  [/^La classe a terminé (\d+) blocs? sur (\d+)$/, (n, target) => `The class has finished ${n} block${n === "1" || n === "0" ? "" : "s"} out of ${target}`],
]

export function rewardText(text: string): string {
  if (language() === "fr" || !text) return text
  if (text in REWARDS_EN) return REWARDS_EN[text]
  for (const [pattern, render] of REWARD_RULES) {
    const match = pattern.exec(text)
    if (match) return render(...match.slice(1))
  }
  return text
}

function capitalFirst(text: string): string { return text.charAt(0).toUpperCase() + text.slice(1) }
function lowerFirst(text: string): string { return text.charAt(0).toLowerCase() + text.slice(1) }
