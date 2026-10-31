export type ProjectFileRef = { id: number; name: string; size: number }
export type Submission = { id: number; milestone_id: number; version: number; text: string; link: string | null; files: ProjectFileRef[]; late: boolean; submitted_by: string; created_at: string | null }
export type Milestone = { id: number; title: string; instructions: string; due_at: string | null; deliverables: string[]; sort_order: number
  submissions?: Submission[]; comments?: { id: number; text: string; created_at: string | null }[] }
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
export type GradeStudent = { id: number; name: string; common: number | null; individual: number | null; total: number | null }
export type TeamGrade = { sql: number | null; python: number | null; nosql: number | null; airflow: number | null; reproducibility: number | null; comment: string; students: GradeStudent[] }
export type TeacherProjectData = {
  assignment_id: number; cohort: string; cohort_id: number
  teams: { id: number; members: { id: number; name: string }[]; grade: TeamGrade }[]
  alone: { id: number; name: string }[]
  milestones: (Omit<Milestone, "submissions" | "comments"> & { submissions: { team_id: number; version: number; versions: number; late: boolean; created_at: string | null }[] })[]
  slots: Slot[]; grid: Record<"sql" | "python" | "nosql" | "airflow" | "reproducibility", number>; individual_max: number
}
