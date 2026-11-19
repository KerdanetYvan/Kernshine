interface BarreProgressionProps {
  /** Avancement de 0 à 100. */
  valeur: number;
  libelle: string;
}

/** Avancement d'une analyse (Figma : « Barre de progression », 12 px de haut). */
export default function BarreProgression({ valeur, libelle }: BarreProgressionProps) {
  const pourcent = Math.min(100, Math.max(0, valeur));
  return (
    <div
      role="progressbar"
      aria-label={libelle}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pourcent)}
      className="h-3 w-full overflow-hidden rounded-full bg-piste"
    >
      <div className="h-full bg-action-primary-bg transition-[width] duration-300" style={{ width: `${pourcent}%` }} />
    </div>
  );
}
