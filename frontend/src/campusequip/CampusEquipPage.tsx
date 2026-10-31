import CampusEquipApp from "./CampusEquipApp"
import "./campusequip.css"

/**
 * Host page of the CampusEquip experience (#/campusequip, #/campusequip/<step>), like « Le voyage d'une donnée »
 * (ADR-0033): the owner's application, scoped under .campusequip-root, in the Academy theme (ADR-0044).
 * The CSV files, the provenance and the subject PDF are static files of the experience (/experiences/campusequip/).
 */
export default function CampusEquipPage({ step = 1, onStep }: { step?: number; onStep?: (step: number) => void }) {
  return <div className="campusequip-root"><CampusEquipApp initialStep={step} onStep={onStep} /></div>
}
