import type { ReactNode } from 'react';
import Cadran from './Cadran';

interface ProgressionCirculaireProps {
  /** Avancement de 0 à 100 ; sans valeur, un arc tourne (durée inconnue). */
  valeur?: number;
  libelle: string;
  /** Contenu au centre : pourcentage, icône… */
  children: ReactNode;
}

// Piste de 188 px et 12 px d'épaisseur dans le disque blanc.
const RAYON = 88;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/** Avancement d'une analyse ou d'un nettoyage (Figma : « Loader de scan », « Progression du nettoyage »). */
export default function ProgressionCirculaire({ valeur, libelle, children }: ProgressionCirculaireProps) {
  const determine = valeur !== undefined;
  const part = determine ? Math.min(100, Math.max(0, valeur)) / 100 : 0.3;
  return (
    <Cadran>
      <div
        role="progressbar"
        aria-label={libelle}
        aria-valuemin={determine ? 0 : undefined}
        aria-valuemax={determine ? 100 : undefined}
        aria-valuenow={determine ? Math.round(part * 100) : undefined}
        className="relative grid size-[188px] place-items-center"
      >
        <svg
          viewBox="0 0 188 188"
          className={`absolute inset-0 -rotate-90 ${determine ? '' : 'animate-spin [animation-duration:1.6s]'}`}
          aria-hidden="true"
        >
          <circle cx="94" cy="94" r={RAYON} fill="none" strokeWidth="12" className="stroke-piste" />
          <circle
            cx="94"
            cy="94"
            r={RAYON}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={CIRCONFERENCE}
            strokeDashoffset={CIRCONFERENCE * (1 - part)}
            className="stroke-action-primary-bg transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <div className="relative flex flex-col items-center">{children}</div>
      </div>
    </Cadran>
  );
}
