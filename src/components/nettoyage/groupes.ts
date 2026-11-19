import type { GroupeZone, ZoneInfo } from '../../types/commands';
import type { CouleurSegment } from '../ui/GraphiqueAnneau';
import { formatListe } from '../../lib/format';

/** Les groupes de la page Nettoyage, dans l'ordre d'affichage. */
export const GROUPES: { id: GroupeZone; nom: string; couleur: CouleurSegment }[] = [
  { id: 'windows', nom: 'Windows', couleur: 'lilas' },
  { id: 'navigateurs', nom: 'Navigateurs', couleur: 'bleu' },
  { id: 'applications', nom: 'Applications', couleur: 'vert' },
  { id: 'autres', nom: 'Autres', couleur: 'or' },
];

const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Résumé d'un groupe à partir de ses zones : « Google Chrome, Microsoft Edge et Mozilla Firefox ».
 * Les zones de Windows et « Autres » sont des noms communs, mis en minuscules dans la phrase.
 */
export function resumeGroupe(groupe: GroupeZone, zones: ZoneInfo[]): string {
  const communs = groupe === 'windows' || groupe === 'autres';
  const noms = zones.map((z) => (communs ? minuscule(z.libelle) : z.libelle));
  return majuscule(formatListe(noms));
}
