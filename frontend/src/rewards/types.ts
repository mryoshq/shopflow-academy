/** ADR-0039: rewards computed by the server from the attempts. Never part of the grade. */
export type Level = { number: number; name: string; xp: number; floor: number; next_name: string | null; next_at: number | null; max_level: boolean }
export type BadgeItem = { key: string; label: string; hint: string; earned: boolean; earned_at: string | null }
export type ClassGoal = {
  metric: "missions" | "blocks"; metric_label: string; target: number; value: number; percent: number
  custom: boolean; default_target: number; milestone: number; text: string
}
export type Rewards = { streak: number; best_streak: number; level: Level; badges: BadgeItem[]; badge_count: number; class_goal?: ClassGoal | null }
export type AttemptRewards = {
  streak: number; best_streak: number; streak_mark: number | null; xp_gained: number; level: Level
  level_up: string | null; block_finished: boolean; new_badges: { key: string; label: string }[]
}
