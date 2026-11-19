import type { ReactNode } from 'react';

interface CadranProps {
  /** Disque lilas (bouton de lancement) ; sinon disque blanc (analyse, progression). */
  plein?: boolean;
  children: ReactNode;
}

/**
 * Anneaux concentriques de 340 px autour d'un disque de 216 px (Figma : « Bouton de scan »,
 * « Loader de scan », « Progression du nettoyage ») : pointillés à 14 %, anneau à 28 %,
 * halo à 10 %, puis le disque et son ombre.
 */
export default function Cadran({ plein = false, children }: CadranProps) {
  return (
    <div className="relative grid size-[340px] shrink-0 place-items-center">
      <svg viewBox="0 0 340 340" className="absolute inset-0 text-action-primary-bg" aria-hidden="true">
        <circle cx="170" cy="170" r="169.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 8" opacity="0.14" />
        <circle cx="170" cy="170" r="145.25" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
        <circle cx="170" cy="170" r="126" fill="currentColor" opacity="0.1" />
      </svg>
      <div
        className={`relative grid size-[216px] place-items-center rounded-full ${
          plein ? 'bg-action-primary-bg shadow-cadran-plein' : 'bg-surface shadow-cadran'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
