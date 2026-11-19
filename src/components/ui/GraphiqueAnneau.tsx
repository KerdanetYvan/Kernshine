export type CouleurSegment = 'lilas' | 'bleu' | 'vert' | 'or';

export interface Segment {
  libelle: string;
  valeur: number;
  /** Texte affiché à droite de la légende (« 12,4 Go »). */
  valeurAffichee: string;
  couleur: CouleurSegment;
}

const traits: Record<CouleurSegment, string> = {
  lilas: 'stroke-action-primary-bg',
  bleu: 'stroke-status-info-fg',
  vert: 'stroke-status-ok-fg',
  or: 'stroke-brand-accent',
};

const pastilles: Record<CouleurSegment, string> = {
  lilas: 'bg-action-primary-bg',
  bleu: 'bg-status-info-fg',
  vert: 'bg-status-ok-fg',
  or: 'bg-brand-accent',
};

interface GraphiqueAnneauProps {
  segments: Segment[];
  /** Texte au centre de l'anneau (« 3 zones »). */
  centre: string;
}

// Anneau de 148 px, 22 px d'épaisseur, petit espace entre les parts.
const RAYON = 63;
const CIRCONFERENCE = 2 * Math.PI * RAYON;
const ESPACE = 3;

/** Répartition en anneau avec sa légende (Figma : « Visuel/Anneau »). */
export default function GraphiqueAnneau({ segments, centre }: GraphiqueAnneauProps) {
  const total = segments.reduce((s, x) => s + x.valeur, 0) || 1;
  const visibles = segments.filter((s) => s.valeur > 0);
  let debut = 0;
  return (
    <div className="flex items-center gap-8 rounded-lg border bg-neutre px-8 py-5">
      <div className="relative grid size-[148px] shrink-0 place-items-center">
        <svg viewBox="0 0 148 148" className="absolute inset-0 -rotate-90" aria-hidden="true">
          {visibles.map((s) => {
            const longueur = (s.valeur / total) * CIRCONFERENCE;
            const trait = visibles.length > 1 ? Math.max(0, longueur - ESPACE) : longueur;
            const offset = -debut;
            debut += longueur;
            return (
              <circle
                key={s.libelle}
                cx="74"
                cy="74"
                r={RAYON}
                fill="none"
                strokeWidth="22"
                strokeDasharray={`${trait} ${CIRCONFERENCE - trait}`}
                strokeDashoffset={offset}
                className={traits[s.couleur]}
              />
            );
          })}
        </svg>
        <span className="relative text-corps-gras text-primary">{centre}</span>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-3.5">
        {segments.map((s) => (
          <li key={s.libelle} className="flex items-center gap-2.5">
            <span className={`size-2.5 shrink-0 rounded-full ${pastilles[s.couleur]}`} />
            <span className="min-w-0 flex-1 truncate text-corps text-primary">{s.libelle}</span>
            <span className="whitespace-nowrap text-corps-gras text-primary">{s.valeurAffichee}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
