import { Suspense } from "react"
import { LoadingState } from "./student/ui"
import { VoyagePage } from "./voyage"
import { MissionPlayer } from "./student/MissionPlayer"
import { StudentDashboard } from "./student/StudentDashboard"
import { useHashRoute } from "./useHashRoute"

export function StudentHome() {
  const { route, navigate } = useHashRoute()
  if (route.name === "voyage") return <Suspense fallback={<LoadingState label="Chargement de l’expérience…" />}>
    <VoyagePage scene={route.scene} onScene={(scene) => navigate(`/voyage/${scene}`)} /></Suspense>
  return route.name === "mission"
    ? <MissionPlayer key={route.id} missionId={route.id} navigate={navigate} />
    : <StudentDashboard navigate={navigate} />
}
