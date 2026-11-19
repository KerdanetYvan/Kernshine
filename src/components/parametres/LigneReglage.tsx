import type { ReactNode } from 'react';
import { CaretRightIcon, type Icon } from '@phosphor-icons/react';

interface LigneReglageProps {
  icone: Icon;
  titre: string;
  description: string;
  /** Contenu à droite : interrupteur, version, bouton… */
  children?: ReactNode;
  /** Ligne cliquable (lien) : toute la ligne devient un bouton avec une flèche. */
  onClick?: () => void;
}

const base = 'flex w-full items-center gap-4 rounded-lg border bg-surface p-4 text-left';

/** Un réglage de la page Paramètres (Figma : « Paramètres – composants »). */
export default function LigneReglage({ icone: Icone, titre, description, children, onClick }: LigneReglageProps) {
  const contenu = (
    <>
      <div className="grid size-12 shrink-0 place-items-center rounded-md bg-brand-shield-fill">
        <Icone weight="duotone" className="size-6 text-secondary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-corps-gras text-primary">{titre}</p>
        <p className="text-corps-petit text-secondary">{description}</p>
      </div>
      {children}
      {onClick && <CaretRightIcon className="size-6 shrink-0 text-secondary" />}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} transition-colors hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-bg`}
      >
        {contenu}
      </button>
    );
  }
  return <div className={base}>{contenu}</div>;
}
