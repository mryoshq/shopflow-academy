export type ProjectFileRef = { id: number; name: string; size: number }
export type Submission = { id: number; milestone_id: number; version: number; text: string; link: string | null; files: ProjectFileRef[]; late: boolean; submitted_by: string; created_at: string | null }
export type Milestone = { id: number; title: string; instructions: string; due_at: string | null; deliverables: string[]; sort_order: number
  submissions?: Submission[]; comments?: { id: number; text: string; created_at: string | null }[] }
/** ADR-0045: automatic reminders of a milestone (3 days then 1 day before, 9:00 Morocco time). */
export type ReminderPlan = { enabled: boolean; pairing?: boolean
  items: { key: "j3" | "j1" | "j0"; days: number; send_at: string; local: string; status: "planned" | "sent" | "passed" | "off"; sent: number }[] }
export type Slot = { id: number; starts_at: string | null; ends_at: string | null; label: string; team_id: number | null; team: string[]; mine: boolean }
export type StudentProjectData = {
  cohort_id: number | null; cohort?: string; cohorts: { id: number; label: string }[]
  team?: { id: number; members: { id: number; name: string }[]; invitations: { id: number; user_id: number; name: string }[]; full: boolean } | null
  invitations?: { id: number; team_id: number; from: string; members: string[] }[]
  classmates?: { id: number; name: string; available: boolean }[]
  milestones?: Milestone[]; slots?: Slot[]
  /** ADR-0041: surprise draw state, and the reveal to show once after a draw. */
  draw?: { registered: boolean; registered_count: number; done: boolean }
  surprise?: { draw_id: number; partners: string[] } | null
}
export type DrawRecord = { id: number; created_at: string | null; by: string; groups: string[][]; left_out: string[] }
export type DrawOverview = {
  free: { id: number; name: string; registered: boolean }[]
  solo_teams: { team_id: number; name: string; has_work: boolean }[]
  draws: DrawRecord[]
}
export type DrawPreview = {
  seed: string; fingerprint: string; pool_size: number
  groups: { members: string[]; existing_team: boolean }[]; left_out: string[]; previous: DrawRecord | null
}
/** ADR-0046: one student on the grid of the two subjects (base /20, bonus /10). */
export type GradeStudent = { id: number; name: string; part1: number | null; part2: number | null; individual: number | null
  base: number | null; bonus: number | null; total: number | null; complete: boolean }
/** Points entered on the former grid (SQL 4, Python 4…), kept as they are and shown apart. */
export type LegacyGrade = { sql: number | null; python: number | null; nosql: number | null; airflow: number | null; reproducibility: number | null
  common: number | null; students: { id: number; name: string; individual: number | null; total: number | null }[] }
export type TeamGrade = { criteria: Record<string, number>; comment: string; students: GradeStudent[]; legacy: LegacyGrade | null }
export type GridLine = { key: string; label: string; max: number }
export type ProjectGrid = { parts: { key: "part1" | "part2"; title: string; base: GridLine[]; individual_max: number; bonus: GridLine[]; bonus_cap: number }[]
  base_max: number; bonus_max: number }
export type TeacherProjectData = {
  assignment_id: number; cohort: string; cohort_id: number
  teams: { id: number; members: { id: number; name: string }[]; grade: TeamGrade }[]
  alone: { id: number; name: string }[]
  milestones: (Omit<Milestone, "submissions" | "comments"> & { reminders?: ReminderPlan; submissions: { team_id: number; version: number; versions: number; late: boolean; created_at: string | null }[] })[]
  slots: Slot[]; grid: ProjectGrid
}
