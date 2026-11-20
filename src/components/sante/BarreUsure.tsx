import type { ReactNode } from 'react';
import type { Statut } from '../ui/Pastille';

const FOND: Record<Statut, string> = {
  ok: 'bg-status-ok-fg',
  surveiller: 'bg-status-warning-fg',
  corriger: 'bg-status-danger-fg',
  info: 'bg-status-info-fg',
  neutre: 'bg-piste-forte',
};

interface BarreUsureProps {
  libelle: string;
  /** 0 à 100, ou absent : seule la valeur (lien, « non communiquée »…) est montrée. */
  valeur?: number;
  statut: Statut;
  children: ReactNode;
}

/** « Usure du disque ……… 18 % » et sa barre (Figma : « Usure »). */
export default function BarreUsure({ libelle, valeur, statut, children }: BarreUsureProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-corps-petit text-secondary">{libelle}</span>
        <span className="text-corps-gras text-primary">{children}</span>
      </div>
      {valeur !== undefined && (
        <div className="h-2 overflow-hidden rounded-full bg-piste" role="meter" aria-label={libelle} aria-valuenow={valeur} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${FOND[statut]}`} style={{ width: `${Math.max(0, Math.min(100, valeur))}%` }} />
        </div>
      )}
    </div>
  );
}
