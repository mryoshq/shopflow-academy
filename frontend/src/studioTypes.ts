export type Role = "student" | "teacher"
export type User = { id: number; username: string; role: Role }
export type CourseSummary = { id: number; slug: string; title: string; status: "draft" | "published" | "archived" }
export type Objective = { id: number; code: string; statement: string; category?: string }
export type Choice = { id: string; label: string }
export type TableDisplay = { kind: "table"; description?: string; title?: string; columns: string[]; rows: (string | number | boolean | null)[][] }
export type BarChartDisplay = { kind: "bar_chart"; description?: string; title: string; labels: string[]; values: number[]; unit: string }
export type LineChartDisplay = { kind: "line_chart"; description?: string; title: string; labels: string[]; series: { name: string; values: (number | null)[] }[]; unit: string }
export type CodeDisplay = { kind: "code"; description?: string; language: "sql" | "python" | "text"; code: string; title?: string }
export type ComparisonDisplay = { kind: "comparison"; description?: string; items: (CodeDisplay | TableDisplay)[] }
export type Cell = string | number | boolean | null
export type SceneTable = { title: string; columns: string[]; rows: Cell[][]; highlight: { rows: number[]; cells: [number, number][] } }
export type Scene = {
  tables: SceneTable[]; arrows: { source: [number, number]; target: [number, number]; label: string }[]
  counter: { label: string; value: string | number } | null; badge: { kind: "ok" | "erreur" | "attention"; text: string } | null
}
export type AnimationDisplay = { kind: "animation"; description?: string; title: string; steps: { caption: string; scene: Scene }[] }
export type MindNode = { label: string; children: MindNode[] }
export type MindmapDisplay = { kind: "mindmap"; description?: string; title: string; root: MindNode }
export type FlowDisplay = { kind: "flow"; description?: string; title: string; input: number; unit: string; steps: { id: string; label: string; rejects: number; note: string }[] }
export type VideoDisplay = { kind: "video"; description?: string; title: string; url: string | null; src: string | null; captions_src: string | null }
export type Flashcard = { front: string; back: string }
export type FlashcardsDisplay = { kind: "flashcards"; description?: string; title?: string; cards: Flashcard[] }
export type ImageDisplay = { kind: "image"; description?: string; src: string; alt: string; caption?: string }
export type DisplayData = ImageDisplay | TableDisplay | BarChartDisplay | LineChartDisplay | CodeDisplay | ComparisonDisplay | AnimationDisplay | MindmapDisplay | FlowDisplay | VideoDisplay | FlashcardsDisplay
/** Not graded, validated with « J'ai compris » and counted like a lesson (ADR-0028). */
export function isUngraded(kind: string): boolean {
  return kind === "lesson" || kind === "review"
}
export type RunView = { id: string; label: string; language: "sql" | "python"; code: string }
export type MissionKind = "single_choice" | "multiple_choice" | "true_false" | "reorder" | "matching" | "data_interpretation" | "scenario_choice" | "guided_simulation" | "lesson" | "sql_challenge" | "review"
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
  explanation?: string
  scoring?: "all_or_nothing" | "partial"
  body?: string
  objective?: string
  hook?: string
  key_terms?: { term: string; definition: string }[]
  example?: string
  practice?: string
  run?: unknown[]
  starter_sql?: string
  expected_sql?: string
  compare?: "rows" | "rows_unordered" | "scalar"
}
export type StudentDefinition = Omit<MissionDefinition, "correct_ids" | "correct_pairs" | "action_id" | "feedback" | "max_points" | "explanation" | "scoring" | "run" | "expected_sql" | "compare"> & { run?: RunView[] }
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
