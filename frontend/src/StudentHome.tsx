import { t } from "./i18n"
import { Suspense } from "react"
import { LoadingState } from "./student/ui"
import { VoyagePage } from "./voyage"
import { CampusEquipPage } from "./campusequip"
import { StudentProject } from "./project/StudentProject"
import { MissionPlayer } from "./student/MissionPlayer"
import { StudentDashboard } from "./student/StudentDashboard"
import { useHashRoute } from "./useHashRoute"
import { Rafi } from "./rafi/Rafi"

/** ADR-0047: the student's pages, with Rafi (also in the teacher's « Vue étudiant », never elsewhere for the teacher). */
export function StudentHome() {
  return <><StudentPage /><Rafi /></>
}

function StudentPage() {
  const { route, navigate } = useHashRoute()
  if (route.name === "voyage") return <Suspense fallback={<LoadingState label={t("Chargement de l’expérience…")} />}>
    <VoyagePage scene={route.scene} onScene={(scene) => navigate(`/voyage/${scene}`)} /></Suspense>
  if (route.name === "campusequip") return <Suspense fallback={<LoadingState label={t("Chargement de l’expérience…")} />}>
    <CampusEquipPage step={route.step} onStep={(step) => navigate(`/campusequip/${step}`)} /></Suspense>
  if (route.name === "projet") return <StudentProject />
  return route.name === "mission"
    ? <MissionPlayer key={route.id} missionId={route.id} navigate={navigate} />
    : <StudentDashboard navigate={navigate} />
}
