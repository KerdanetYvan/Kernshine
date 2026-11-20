import type { ReactNode } from 'react';

/** « Utilisé ……… 228 Go » (Figma : « Ligne de donnée »). */
export default function LigneDonnee({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-corps-petit text-secondary">{libelle}</dt>
      <dd className="text-corps-gras text-primary">{children}</dd>
    </div>
  );
}
