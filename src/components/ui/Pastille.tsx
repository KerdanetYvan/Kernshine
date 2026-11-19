import type { ReactNode } from 'react';

export type Statut = 'ok' | 'surveiller' | 'corriger' | 'info' | 'neutre';

const couleurs: Record<Statut, string> = {
  ok: 'bg-status-ok-bg text-status-ok-fg',
  surveiller: 'bg-status-warning-bg text-status-warning-fg',
  corriger: 'bg-status-danger-bg text-status-danger-fg',
  info: 'bg-status-info-bg text-status-info-fg',
  neutre: 'bg-piste text-secondary',
};

/** Les quatre états de la marque, plus « Jamais analysé ». */
const libelles: Record<Statut, string> = {
  ok: 'Tout va bien',
  surveiller: 'À surveiller',
  corriger: 'À corriger',
  info: 'Bon à savoir',
  neutre: 'Jamais analysé',
};

interface PastilleProps {
  statut: Statut;
  /** Remplace le libellé par défaut du statut (« Ralentit beaucoup », « Sans risque »…). */
  children?: ReactNode;
}

/** Indique l'état d'un point de contrôle (Figma : « Pastille d'état »). */
export default function Pastille({ statut, children }: PastilleProps) {
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-4 py-2 text-libelle ${couleurs[statut]}`}>
      {children ?? libelles[statut]}
    </span>
  );
}
