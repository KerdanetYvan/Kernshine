import type { Icon } from '@phosphor-icons/react';
import Bouton, { type VarianteBouton } from '../ui/Bouton';
import Pastille, { type Statut } from '../ui/Pastille';

export interface ActionReparation {
  libelle: string;
  variante?: VarianteBouton;
  onClick: () => void;
  /** Action en cours : bouton désactivé avec ce libellé. */
  enCours?: string | false;
}

interface LigneReparationProps {
  icone: Icon;
  nom: string;
  description: string;
  statut: Statut;
  libelleStatut: string;
  action?: ActionReparation;
}

/** Une réparation de la page Réparation (Figma : « Ligne de réparation »). */
export default function LigneReparation({ icone: Icone, nom, description, statut, libelleStatut, action }: LigneReparationProps) {
  return (
    <li className="flex items-center gap-4 rounded-lg border bg-surface py-4 pl-4 pr-6">
      <div className="grid size-12 shrink-0 place-items-center rounded-md bg-subtle">
        <Icone weight="duotone" className="size-6 text-secondary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-corps-gras text-primary">{nom}</p>
        <p className="text-corps-petit text-secondary">{description}</p>
      </div>
      <Pastille statut={statut}>{libelleStatut}</Pastille>
      {action && (
        <Bouton variante={action.variante ?? 'principal'} taille="compact" onClick={action.onClick} disabled={!!action.enCours}>
          {action.enCours || action.libelle}
        </Bouton>
      )}
    </li>
  );
}
