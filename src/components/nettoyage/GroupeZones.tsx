import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import type { ZoneInfo } from '../../types/commands';
import { formatOctets } from '../../lib/format';
import CaseACocher from '../ui/CaseACocher';
import Pastille from '../ui/Pastille';
import { resumeGroupe } from './groupes';

interface GroupeZonesProps {
  groupe: { id: ZoneInfo['groupe']; nom: string };
  zones: ZoneInfo[];
  selection: Set<string>;
  /** Coche ou décoche ces zones. */
  onBasculer: (ids: string[], coche: boolean) => void;
  deplie: boolean;
  onDeplier: () => void;
}

/**
 * Un groupe de la liste des résultats (Figma : « En-tête de groupe » et « Ligne de résultat »).
 * Rendu en fragment : le parent sépare chaque ligne d'un trait (divide-y).
 */
export default function GroupeZones({ groupe, zones, selection, onBasculer, deplie, onDeplier }: GroupeZonesProps) {
  const ids = zones.map((z) => z.id);
  const cochees = ids.filter((id) => selection.has(id)).length;
  const etat = cochees === 0 ? false : cochees === ids.length ? true : 'partiel';
  const taille = zones.reduce((s, z) => s + z.sizeBytes, 0);
  const Fleche = deplie ? CaretDownIcon : CaretRightIcon;

  return (
    <>
      <div className="flex min-h-[72px] items-center gap-4 px-6 py-3">
        <CaseACocher etat={etat} onChange={(c) => onBasculer(ids, c)} libelle={`Tout le groupe ${groupe.nom}`} />
        <button
          type="button"
          onClick={onDeplier}
          aria-expanded={deplie}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-action-primary-bg"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-corps-gras text-primary">{groupe.nom}</span>
            <span className="truncate text-corps-petit text-secondary">{resumeGroupe(groupe.id, zones)}</span>
          </span>
          <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(taille)}</span>
          <Fleche className="size-6 shrink-0 text-secondary" />
        </button>
      </div>

      {deplie &&
        zones.map((z) => (
          <div key={z.id} className="flex min-h-16 items-center gap-4 py-3 pl-16 pr-6">
            <CaseACocher etat={selection.has(z.id)} onChange={(c) => onBasculer([z.id], c)} libelle={z.libelle} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-corps text-primary">{z.libelle}</p>
              <p className="text-corps-petit text-secondary">
                {z.description}
                {z.lockedByProcess && <span className="text-status-warning-fg"> · Fermez {z.lockedByProcess} pour tout nettoyer</span>}
              </p>
            </div>
            <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(z.sizeBytes)}</span>
            {z.risque === 'sans_risque' ? (
              <Pastille statut="ok">Sans risque</Pastille>
            ) : (
              <Pastille statut="surveiller">À vérifier</Pastille>
            )}
          </div>
        ))}
    </>
  );
}
