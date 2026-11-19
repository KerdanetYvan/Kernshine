import type { ButtonHTMLAttributes } from 'react';

export type VarianteBouton = 'principal' | 'secondaire' | 'danger';

interface BoutonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Principal : une seule action mise en avant par écran. */
  variante?: VarianteBouton;
  taille?: 'normal' | 'compact';
}

const variantes: Record<VarianteBouton, string> = {
  principal: 'border-transparent bg-action-primary-bg text-action-primary-fg hover:bg-action-primary-bg/90',
  secondaire: 'border-strong bg-surface text-primary hover:bg-subtle',
  danger: 'border-transparent bg-status-danger-fg text-inverse hover:bg-status-danger-fg/90',
};

// Bordure de 2 px sur toutes les variantes (transparente quand elle ne se voit pas) :
// les trois ont ainsi la même taille, 56 px en normal et 40 px en compact.
const tailles = {
  normal: 'px-[30px] py-3.5',
  compact: 'px-[18px] py-1.5',
};

/** Bouton d'action (Figma : « Bouton »). */
export default function Bouton({ variante = 'principal', taille = 'normal', className = '', type = 'button', ...props }: BoutonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border-2 text-bouton transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantes[variante],
        tailles[taille],
        className,
      ].join(' ')}
      {...props}
    />
  );
}
