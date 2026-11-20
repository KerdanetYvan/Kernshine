import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import type { Statut } from '../ui/Pastille';
import Carte from '../ui/Carte';
import Pastille from '../ui/Pastille';

interface CarteSanteProps {
  icone: Icon;
  titre: string;
  statut: Statut;
  /** Texte de la pastille (« Bon état », « Chaud »…). */
  etat: string;
  /** Conseil sous les données, quand quelque chose est à surveiller. */
  conseil?: string;
  className?: string;
  children: ReactNode;
}

/** Cadre d'une carte de la page Santé (Figma : « Carte de santé »). */
export default function CarteSante({ icone: Icone, titre, statut, etat, conseil, className = '', children }: CarteSanteProps) {
  return (
    <Carte className={`flex flex-col gap-6 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-shield-fill">
          <Icone weight="duotone" className="size-6 text-brand-shield-stroke" />
        </div>
        <h2 className="min-w-0 flex-1 truncate text-titre-3 text-primary">{titre}</h2>
        <Pastille statut={statut}>{etat}</Pastille>
      </div>
      {children}
      {conseil && <p className="text-corps-petit text-secondary">{conseil}</p>}
    </Carte>
  );
}
