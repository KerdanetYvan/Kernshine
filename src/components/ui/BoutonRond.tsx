import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface BoutonRondProps {
  /** Texte lu par les lecteurs d'écran et affiché au survol. */
  libelle: string;
  /** Icône Phosphor en graisse normale (un geste, pas une rubrique). */
  children: ReactNode;
  /** Lien vers une page de l'application ; sinon c'est un bouton. */
  vers?: string;
  onClick?: () => void;
}

const classes =
  'grid size-12 shrink-0 place-items-center rounded-full border bg-surface text-secondary transition-colors hover:bg-subtle ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-bg';

/** Bouton rond de 48 px avec une icône (Figma : « Bouton rond »). */
export default function BoutonRond({ libelle, children, vers, onClick }: BoutonRondProps) {
  if (vers) {
    return (
      <Link to={vers} aria-label={libelle} title={libelle} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={libelle} title={libelle} className={classes}>
      {children}
    </button>
  );
}
