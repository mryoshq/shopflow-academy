import type { NextDeadline } from "./NextDeadline"
import type { Choice, DisplayData, MissionKind, RunView } from "../studioTypes"

export type MissionStatus = "locked" | "not_started" | "in_progress" | "completed"

export type DashboardMission = {
  mission_version_id: number
  title: string
  module: string
  chapter: string
  kind: MissionKind | null
  estimated_duration_minutes: number | null
  status: MissionStatus
  locked_by: string[]
  unlocked_by_teacher?: boolean
  best_points: number
  possible: number
  bonus: boolean
  block_id?: number | null
}

export type DashboardBlock = {
  id: number
  title: string
  /** The block's objective in one sentence, never its code (open blocks only). */
  objective?: string
  open: boolean
  /** ADR-0023: opened by the teacher for this student only. */
  for_you?: boolean
  mission_count: number
  bonus_count: number
  completed_count: number
  lesson_count?: number
  lessons_read?: number
  done: boolean
  mission_ids: number[]
}
export type DashboardModule = { title: string; description?: string; blocks: DashboardBlock[] }

export type HelpRequestState = { id: number; status: "pending" | "handled"; message: string; created_at: string; handled_at: string | null }

export type CourseScore = { core_points: number; core_possible: number; bonus_points: number; bonus_possible: number; completed: number; total: number }
export type MissionScore = { best: number; possible: number; bonus: boolean }
export type AttemptHistoryItem = { id: number; created_at: string; correct: boolean; points: number }

export type DashboardCourse = {
  release_id: number
  title: string
  description: string
  version: number
  is_demo: boolean
  resources: string[]
  score: CourseScore
  paused: boolean
  modules?: DashboardModule[]
  missions: DashboardMission[]
  /** ADR-0027: announcement of the rules against random clicking. */
  rules_notice?: { text: string; since: string } | null
  /** ADR-0039: streak, level, badges and class goal (never part of the score). */
  rewards?: Rewards
}

export type Dashboard = { display_name: string; ai_enabled: boolean; courses: DashboardCourse[]
  /** ADR-0047: next project deadline (countdown) and Rafi's class-wide sounds. */
  next_deadline?: NextDeadline | null; rafi?: { sounds: boolean } }

export type PlayerDefinition = {
  kind: MissionKind
  objective?: string
  hook?: string
  key_terms?: { term: string; definition: string }[]
  example?: string
  practice?: string
  scenario: string
  instructions: string
  choices: Choice[]
  match_targets: Choice[]
  display_data: DisplayData | null
  resources: string[]
  hint_count: number
  estimated_duration_minutes: number
  body?: string
  run?: RunView[]
  starter_sql?: string
}

export type PlayerMission = {
  mission_version_id: number
  release_id: number
  course_title: string
  is_demo: boolean
  module: string
  chapter: string
  title: string
  position: number
  total: number
  previous_id: number | null
  next_id: number | null
  ai_enabled: boolean
  paused: boolean
  status: MissionStatus
  locked_by: string[]
  definition: PlayerDefinition | null
  hints: string[]
  hint_count: number
  attempts_count: number
  last_attempt: { correct: boolean; created_at: string } | null
  explanation: string | null
  score: MissionScore | null
  help_request?: HelpRequestState | null
  /** ADR-0027, when the teacher turned the rules on. */
  rules?: AttemptRules
}

export type AttemptRules = {
  next_attempt: number | null
  next_percent: number | null
  pause_remaining: number
  reading_seconds: number | null
  reading_remaining: number
}

import type { AttemptRewards, Rewards } from "../rewards/types"

export type Answer = { choice_ids: string[]; pairs: Record<string, string> }

export type AttemptResult = {
  percent?: number | null
  attempt_number?: number | null
  rules?: AttemptRules
  attempt_id: number
  correct: boolean
  replayed: boolean
  attempts_count: number
  points: number
  score: MissionScore
  feedback: { choice_id: string; text: string }[]
  explanation: string | null
  /** ADR-0039: absent on a replayed attempt. */
  rewards?: AttemptRewards
}
