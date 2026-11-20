import type { ReactNode } from 'react';
import CaseACocher from '../ui/CaseACocher';

interface LigneRecapProps {
  titre: string;
  detail?: string;
  /** Case de la ligne ; absente dans le bilan. */
  coche?: boolean;
  onCocher?: (coche: boolean) => void;
  /** Icône du bilan (validé, à reprendre) à la place de la case. */
  icone?: ReactNode;
  /** Taille, pastilles, « Ne plus proposer »… */
  fin?: ReactNode;
}

/** Une zone, un fichier, une application ou un pilote dans une étape de l'entretien. */
export default function LigneRecap({ titre, detail, coche, onCocher, icone, fin }: LigneRecapProps) {
  return (
    <div className="flex min-h-16 items-center gap-4 py-3 pl-10 pr-6">
      {coche !== undefined && onCocher && <CaseACocher etat={coche} onChange={onCocher} libelle={titre} />}
      {icone}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-corps text-primary">{titre}</p>
        {detail && <p className="truncate text-corps-petit text-secondary">{detail}</p>}
      </div>
      {fin}
    </div>
  );
}
