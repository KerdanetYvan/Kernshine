import type { ReactNode } from 'react';
import Carte from '../ui/Carte';

interface TuileProps {
  titre: string;
  /** « 74 % », « 28 Go » */
  valeur: string;
  /** Petit texte à côté de la valeur (« restants »). */
  unite?: string;
  detail: string;
  children?: ReactNode;
}

/** Une mesure en direct en haut de l'Accueil : mémoire, processeur, disque (Figma : « Tuile »). */
export default function Tuile({ titre, valeur, unite, detail, children }: TuileProps) {
  return (
    <Carte className="flex min-w-0 flex-col gap-3 p-5">
      <p className="text-corps-gras text-primary">{titre}</p>
      <div className="flex flex-col gap-1">
        <p className="flex items-baseline gap-2">
          <span className="font-titre text-titre-1 text-primary">{valeur}</span>
          {unite && <span className="text-corps text-secondary">{unite}</span>}
        </p>
        <p className="text-corps-petit text-secondary">{detail}</p>
      </div>
      {children}
    </Carte>
  );
}
