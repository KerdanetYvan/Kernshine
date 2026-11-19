import { CheckIcon } from '@phosphor-icons/react';

interface CaseACocherProps {
  /** `'partiel'` quand une partie seulement d'un groupe est cochée. */
  etat: boolean | 'partiel';
  onChange: (coche: boolean) => void;
  libelle: string;
  disabled?: boolean;
}

/** Sélection d'un élément dans une liste (Figma : « Case à cocher », 28 px). */
export default function CaseACocher({ etat, onChange, libelle, disabled }: CaseACocherProps) {
  const coche = etat === true;
  const partiel = etat === 'partiel';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={partiel ? 'mixed' : coche}
      aria-label={libelle}
      disabled={disabled}
      // Un groupe partiel se coche entièrement au clic.
      onClick={() => onChange(!coche)}
      className={[
        'grid size-7 shrink-0 place-items-center rounded-sm border-2 transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        coche || partiel ? 'border-transparent bg-action-primary-bg text-action-primary-fg' : 'border-strong bg-surface',
      ].join(' ')}
    >
      {coche && <CheckIcon weight="bold" className="size-5" />}
      {partiel && <span className="h-[2.5px] w-3 rounded-full bg-action-primary-fg" />}
    </button>
  );
}
