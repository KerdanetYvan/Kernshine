import { PackageIcon } from '@phosphor-icons/react';
import type { SoftwareUpdate } from '../../types/commands';
import Bouton from '../ui/Bouton';
import CaseACocher from '../ui/CaseACocher';
import Pastille from '../ui/Pastille';
import { CONSEIL_BLOQUEE, versions } from './versions';

/** Où en est la fermeture d'une application ouverte. */
export type Fermeture =
  | { etat: 'en_cours' }
  /** Fermée comme avec sa croix, elle tourne encore (souvent près de l'horloge). */
  | { etat: 'encore_ouverte' }
  | { etat: 'introuvable' };

interface LigneMiseAJourProps {
  pkg: SoftwareUpdate;
  coche: boolean;
  onCocher: (coche: boolean) => void;
  onMasquer: () => void;
  fermeture?: Fermeture;
  onFermer: (forcer: boolean) => void;
}

/** Une mise à jour proposée (Figma : « Ligne de mise à jour »). */
export default function LigneMiseAJour({ pkg, coche, onCocher, onMasquer, fermeture, onFermer }: LigneMiseAJourProps) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-surface px-4 py-3">
      <div className="flex items-center gap-4">
        <CaseACocher etat={coche} onChange={onCocher} libelle={`Mettre à jour ${pkg.name}`} />
        <div className="grid size-12 shrink-0 place-items-center rounded-md bg-subtle">
          <PackageIcon weight="duotone" className="size-6 text-secondary" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-corps-gras text-primary">{pkg.name}</p>
          <p className="text-corps-petit text-secondary">{versions(pkg)}</p>
          {pkg.stuck && <p className="text-corps-petit text-secondary">{CONSEIL_BLOQUEE}</p>}
        </div>
        {pkg.open ? (
          <>
            <Pastille statut="neutre">Ouverte</Pastille>
            <Bouton variante="secondaire" taille="compact" onClick={() => onFermer(false)} disabled={fermeture?.etat === 'en_cours'}>
              {fermeture?.etat === 'en_cours' ? 'Fermeture…' : 'Fermer'}
            </Bouton>
          </>
        ) : (
          <button
            type="button"
            onClick={onMasquer}
            className="shrink-0 rounded-sm text-libelle text-secondary underline underline-offset-2 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-action-primary-bg"
          >
            Ne plus proposer
          </button>
        )}
      </div>

      {fermeture?.etat === 'encore_ouverte' && (
        <div className="flex flex-wrap items-center gap-3 pl-[104px]">
          <p className="min-w-0 flex-1 text-corps-petit text-secondary">
            {pkg.name} est encore ouvert, sans doute près de l'horloge. Quittez-le depuis son icône, ou forcez la
            fermeture : un travail non enregistré serait perdu.
          </p>
          <Bouton variante="danger" taille="compact" onClick={() => onFermer(true)}>Forcer la fermeture</Bouton>
        </div>
      )}
      {fermeture?.etat === 'introuvable' && (
        <p className="pl-[104px] text-corps-petit text-secondary">
          Kernshine n'a pas trouvé la fenêtre de {pkg.name}. Fermez-le vous-même, puis vérifiez à nouveau.
        </p>
      )}
    </li>
  );
}
