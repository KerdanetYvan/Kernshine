import type { Statut } from '../ui/Pastille';

interface AnneauSanteProps {
  /** 0 à 100 */
  valeur: number;
  /** « utilisé », « de la capacité » */
  libelle: string;
  statut: Statut;
}

const TRAIT: Record<Statut, string> = {
  ok: 'stroke-status-ok-fg',
  surveiller: 'stroke-status-warning-fg',
  corriger: 'stroke-status-danger-fg',
  info: 'stroke-status-info-fg',
  neutre: 'stroke-piste',
};

const R = 56;
const CIRCONFERENCE = 2 * Math.PI * R;

/** Anneau de 128 px avec le pourcentage au centre (Figma : « Anneau »). */
export default function AnneauSante({ valeur, libelle, statut }: AnneauSanteProps) {
  const v = Math.max(0, Math.min(100, valeur));
  return (
    <div className="relative grid size-32 shrink-0 place-items-center">
      <svg viewBox="0 0 128 128" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="12" className="stroke-piste" />
        <circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={CIRCONFERENCE}
          strokeDashoffset={CIRCONFERENCE * (1 - v / 100)}
          className={TRAIT[statut]}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="font-titre text-titre-2 text-primary">{Math.round(v)} %</span>
        <span className="text-legende text-secondary">{libelle}</span>
      </div>
    </div>
  );
}
