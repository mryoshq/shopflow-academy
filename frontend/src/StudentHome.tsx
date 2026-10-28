import { Leaderboard } from "./student/Leaderboard"
import { MissionPlayer } from "./student/MissionPlayer"
import { StudentDashboard } from "./student/StudentDashboard"
import { useHashRoute } from "./useHashRoute"

export function StudentHome() {
  const { route, navigate } = useHashRoute()
  if (route.name === "mission") return <MissionPlayer key={route.id} missionId={route.id} navigate={navigate} />
  if (route.name === "leaderboard") return <Leaderboard key={route.id} classId={route.id} navigate={navigate} />
  return <StudentDashboard navigate={navigate} />
}
