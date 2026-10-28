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
  mission_count: number
  bonus_count: number
  completed_count: number
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
  /** Class leaderboard, when the teacher turned it on (ADR-0026). */
  leaderboard_id?: number | null
}

export type Dashboard = { display_name: string; ai_enabled: boolean; courses: DashboardCourse[] }

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
}

export type Answer = { choice_ids: string[]; pairs: Record<string, string> }

export type AttemptResult = {
  attempt_id: number
  correct: boolean
  replayed: boolean
  attempts_count: number
  points: number
  score: MissionScore
  feedback: { choice_id: string; text: string }[]
  explanation: string | null
}
