import type { Choice, DisplayData, MissionKind } from "../studioTypes"

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
}

export type DashboardCourse = {
  release_id: number
  title: string
  description: string
  version: number
  is_demo: boolean
  resources: string[]
  missions: DashboardMission[]
}

export type Dashboard = { display_name: string; ai_enabled: boolean; courses: DashboardCourse[] }

export type PlayerDefinition = {
  kind: MissionKind
  scenario: string
  instructions: string
  choices: Choice[]
  match_targets: Choice[]
  display_data: DisplayData | null
  resources: string[]
  hint_count: number
  estimated_duration_minutes: number
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
  status: MissionStatus
  locked_by: string[]
  definition: PlayerDefinition | null
  hints: string[]
  hint_count: number
  attempts_count: number
  last_attempt: { correct: boolean; created_at: string } | null
  explanation: string | null
}

export type Answer = { choice_ids: string[]; pairs: Record<string, string> }

export type AttemptResult = {
  attempt_id: number
  correct: boolean
  replayed: boolean
  attempts_count: number
  feedback: { choice_id: string; text: string }[]
  explanation: string | null
}
