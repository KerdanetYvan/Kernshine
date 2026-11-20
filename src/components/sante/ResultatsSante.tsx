import { memoireSante } from './memoire';

/** Résultats de la vérification (Figma : « Santé – Tout va bien » / « À surveiller »). Cartes : étape suivante. */
export default function ResultatsSante() {
  const r = memoireSante.rapport;
  if (!r) return null;
  return <p className="text-corps text-secondary">{r.disks.length} disques vérifiés.</p>;
}
