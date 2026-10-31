import { t } from "../i18n"
import type { Account } from "./PreferencesProvider"

function parts(username: string): string[] {
  return username.split("@")[0].split(/[._-]+/).filter(Boolean)
}

/** « youness.achaq@ynov.com » → « Youness Achaq » (same rule as the leaderboard names). */
export function displayName(username: string): string {
  const words = parts(username).map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  return words.join(" ") || username
}

/** Two initials for the avatar: « YA ». */
export function initials(username: string): string {
  return parts(username).slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("") || "?"
}

export function roleLabel(role: Account["role"]): string {
  return role === "teacher" ? t("Enseignant") : role === "observer" ? t("Observateur (lecture seule)") : t("Étudiant")
}
