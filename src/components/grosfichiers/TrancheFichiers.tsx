import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import type { BigFile } from '../../types/commands';
import { formatOctets, pluriel } from '../../lib/format';
import CaseACocher from '../ui/CaseACocher';
import { detailFichier } from './fichiers';

interface TrancheFichiersProps {
  nom: string;
  fichiers: BigFile[];
  selection: Set<string>;
  onBasculer: (ids: string[], coche: boolean) => void;
  deplie: boolean;
  onDeplier: () => void;
}

/** Une tranche de taille (« Plus de 5 Go ») et ses fichiers (Figma : « Gros fichiers – Résultats »). */
export default function TrancheFichiers({ nom, fichiers, selection, onBasculer, deplie, onDeplier }: TrancheFichiersProps) {
  const ids = fichiers.map((f) => f.id);
  const cochees = ids.filter((id) => selection.has(id)).length;
  const etat = cochees === 0 ? false : cochees === ids.length ? true : 'partiel';
  const taille = fichiers.reduce((s, f) => s + f.sizeBytes, 0);
  const Fleche = deplie ? CaretDownIcon : CaretRightIcon;

  return (
    <>
      <div className="flex min-h-[72px] items-center gap-4 px-6 py-3">
        <CaseACocher etat={etat} onChange={(c) => onBasculer(ids, c)} libelle={`Tous les fichiers : ${nom}`} />
        <button
          type="button"
          onClick={onDeplier}
          aria-expanded={deplie}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-action-primary-bg"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-corps-gras text-primary">{nom}</span>
            <span className="text-corps-petit text-secondary">{fichiers.length} {pluriel(fichiers.length, 'fichier')}</span>
          </span>
          <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(taille)}</span>
          <Fleche className="size-6 shrink-0 text-secondary" />
        </button>
      </div>
      {deplie &&
        fichiers.map((f) => (
          <div key={f.id} className="flex min-h-16 items-center gap-4 py-3 pl-16 pr-6">
            <CaseACocher etat={selection.has(f.id)} onChange={(c) => onBasculer([f.id], c)} libelle={f.name} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-corps text-primary">{f.name}</p>
              <p className="truncate text-corps-petit text-secondary">{detailFichier(f)}</p>
            </div>
            <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(f.sizeBytes)}</span>
          </div>
        ))}
    </>
  );
}
