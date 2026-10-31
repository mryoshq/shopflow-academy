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
