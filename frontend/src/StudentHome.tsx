import { MissionPlayer } from "./student/MissionPlayer"
import { StudentDashboard } from "./student/StudentDashboard"
import { useHashRoute } from "./useHashRoute"

export function StudentHome() {
  const { route, navigate } = useHashRoute()
  return route.name === "mission"
    ? <MissionPlayer key={route.id} missionId={route.id} navigate={navigate} />
    : <StudentDashboard navigate={navigate} />
}
