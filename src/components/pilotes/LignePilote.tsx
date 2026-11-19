import { CpuIcon } from '@phosphor-icons/react';
import type { Driver } from '../../types/commands';
import CaseACocher from '../ui/CaseACocher';
import Pastille from '../ui/Pastille';
import { versionsPilote } from './texte';

interface LignePiloteProps {
  pilote: Driver;
  coche: boolean;
  onCocher: (coche: boolean) => void;
  onMasquer: () => void;
}

/** Un pilote proposé (Figma : « Pilotes – Liste »). */
export default function LignePilote({ pilote, coche, onCocher, onMasquer }: LignePiloteProps) {
  return (
    <li className="flex items-center gap-4 rounded-lg border bg-surface px-4 py-3">
      <CaseACocher etat={coche} onChange={onCocher} libelle={`Mettre à jour ${pilote.name}`} />
      <div className="grid size-12 shrink-0 place-items-center rounded-md bg-subtle">
        <CpuIcon weight="duotone" className="size-6 text-secondary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-corps-gras text-primary">{pilote.name}</p>
        <p className="text-corps-petit text-secondary">{versionsPilote(pilote)}</p>
      </div>
      <button
        type="button"
        onClick={onMasquer}
        className="shrink-0 rounded-sm text-libelle text-secondary underline underline-offset-2 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-action-primary-bg"
      >
        Ne plus proposer
      </button>
      {pilote.needsRestart && <Pastille statut="neutre">Redémarrage requis</Pastille>}
    </li>
  );
}
