import type { ReactNode } from 'react';
import { CaretDownIcon, CaretRightIcon, type Icon } from '@phosphor-icons/react';
import CaseACocher from '../ui/CaseACocher';

interface GroupeRecapProps {
  icone: Icon;
  titre: string;
  description: string;
  /** « 32,8 Go » ou rien. */
  total?: string;
  /** Case du groupe : absente dans le bilan. */
  etat?: boolean | 'partiel';
  onCocher?: (coche: boolean) => void;
  /** Pastille à la place de la case (bilan : « Terminé »). */
  badge?: ReactNode;
  deplie: boolean;
  onDeplier: () => void;
  children: ReactNode;
}

/** Une étape dans le récapitulatif ou le bilan de l'entretien, dépliable (Figma : « Groupe d'étape »). */
export default function GroupeRecap({ icone: Icone, titre, description, total, etat, onCocher, badge, deplie, onDeplier, children }: GroupeRecapProps) {
  const Fleche = deplie ? CaretDownIcon : CaretRightIcon;
  return (
    <section className="divide-y overflow-hidden rounded-xl border bg-surface">
      <div className="flex min-h-[88px] items-center gap-4 px-6 py-4">
        {etat !== undefined && onCocher && <CaseACocher etat={etat} onChange={onCocher} libelle={`Toute l'étape : ${titre}`} />}
        <button
          type="button"
          onClick={onDeplier}
          aria-expanded={deplie}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-action-primary-bg"
        >
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-subtle">
            <Icone weight="duotone" className="size-6 text-secondary" />
          </div>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-titre-3 text-primary">{titre}</span>
            <span className="truncate text-corps-petit text-secondary">{description}</span>
          </span>
          {badge}
          {total && <span className="whitespace-nowrap font-titre text-titre-3 text-primary">{total}</span>}
          <Fleche className="size-6 shrink-0 text-secondary" />
        </button>
      </div>
      {deplie && children}
    </section>
  );
}
