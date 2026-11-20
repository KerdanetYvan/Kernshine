interface CourbeProps {
  /** Valeurs de 0 à 100, de la plus ancienne à la plus récente. */
  valeurs: number[];
  couleur: 'or' | 'vert';
}

const COULEURS = {
  or: { trait: 'stroke-brand-accent', fond: 'fill-brand-accent/15', point: 'fill-brand-accent' },
  vert: { trait: 'stroke-status-ok-fg', fond: 'fill-status-ok-bg', point: 'fill-status-ok-fg' },
};

/** Petite courbe d'une tuile de l'Accueil (Figma : « Courbe »), avec un point sur la dernière valeur. */
export default function Courbe({ valeurs, couleur }: CourbeProps) {
  if (valeurs.length < 2) return <div className="h-10" />;
  const c = COULEURS[couleur];
  const x = (i: number) => (i / (valeurs.length - 1)) * 196 + 2;
  const y = (v: number) => 38 - (Math.max(0, Math.min(100, v)) / 100) * 34;
  const ligne = valeurs.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const dernier = valeurs[valeurs.length - 1];
  return (
    <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
      <path d={`${ligne} L 198 40 L 2 40 Z`} className={c.fond} />
      <path d={ligne} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className={c.trait} />
      <circle cx={x(valeurs.length - 1)} cy={y(dernier)} r="3" className={c.point} />
    </svg>
  );
}
