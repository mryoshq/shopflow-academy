export type Role = "student" | "teacher"
export type User = { id: number; username: string; role: Role }
export type CourseSummary = { id: number; slug: string; title: string; status: "draft" | "published" | "archived" }
export type Objective = { id: number; code: string; statement: string }
export type Choice = { id: string; label: string }
export type TableDisplay = { kind: "table"; columns: string[]; rows: (string | number | boolean | null)[][] }
export type BarChartDisplay = { kind: "bar_chart"; title: string; labels: string[]; values: number[]; unit: string }
export type DisplayData = TableDisplay | BarChartDisplay
export type MissionKind = "single_choice" | "multiple_choice" | "true_false" | "reorder" | "matching" | "data_interpretation" | "scenario_choice" | "guided_simulation"
export type MissionDefinition = {
  schema_version: 1
  kind: MissionKind
  scenario: string
  instructions: string
  objective_ids: number[]
  prerequisite_mission_ids: number[]
  choices: Choice[]
  correct_ids: string[]
  match_targets: Choice[]
  correct_pairs: Record<string, string>
  action_id: string | null
  display_data: DisplayData | null
  resources: string[]
  hints: string[]
  feedback: Record<string, string>
  max_points: number
  estimated_duration_minutes: number
  bonus: boolean
}
export type StudentDefinition = Omit<MissionDefinition, "correct_ids" | "correct_pairs" | "action_id" | "feedback" | "max_points">
export type Mission = { id: number; slug: string; title: string; sort_order: number; definition: MissionDefinition | null }
export type StudentMission = Omit<Mission, "definition"> & { definition: StudentDefinition | null; mission_version_id?: number }
export type Chapter<T = Mission> = { id: number; title: string; sort_order: number; missions: T[] }
export type CourseModule<T = Mission> = { id: number; title: string; sort_order: number; chapters: Chapter<T>[] }
export type CourseTree = CourseSummary & { description: string; objectives: Objective[]; modules: CourseModule[] }
export type StudentCourse = Omit<CourseTree, "status" | "modules"> & { version: number; modules: CourseModule<StudentMission>[] }
export type Release = { id: number; version: number; status: "published" | "archived"; published_at: string }
export type Cohort = { id: number; label: string }
export type CohortDetail = Cohort & { student_ids: number[]; release_ids: number[] }
export type StudentAccount = { id: number; username: string }
