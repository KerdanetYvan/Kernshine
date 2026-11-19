import { AppWindowIcon, DiscIcon, FileIcon, FilePdfIcon, FileZipIcon, FilmStripIcon, ImageIcon, MusicNotesIcon, type Icon } from '@phosphor-icons/react';
import type { BigFile, BigFileScan, GenreFichier } from '../../types/commands';

const GO = 1024 ** 3;
const MO = 1024 ** 2;

/** Tranches de taille de la liste, de la plus grosse à la plus petite. */
export const TRANCHES = [
  { id: 'plus5go', nom: 'Plus de 5 Go', min: 5 * GO, max: Infinity },
  { id: '1a5go', nom: 'De 1 à 5 Go', min: GO, max: 5 * GO },
  { id: '500moa1go', nom: 'De 500 Mo à 1 Go', min: 500 * MO, max: GO },
  { id: '100a500mo', nom: 'De 100 à 500 Mo', min: 100 * MO, max: 500 * MO },
];

export const ICONES: Record<GenreFichier, Icon> = {
  video: FilmStripIcon,
  archive: FileZipIcon,
  image_disque: DiscIcon,
  installateur: AppWindowIcon,
  image: ImageIcon,
  audio: MusicNotesIcon,
  document: FilePdfIcon,
  autre: FileIcon,
};

/** « Vidéos › Vacances · Pas modifié depuis 14 mois » */
export function detailFichier(f: BigFile): string {
  const lieu = f.location.join(' › ');
  const j = f.daysSinceModified;
  if (j === null) return lieu;
  if (j < 31) return `${lieu} · Modifié ce mois-ci`;
  if (j < 365) return `${lieu} · Pas modifié depuis ${Math.round(j / 30.4)} mois`;
  const ans = Math.floor(j / 365);
  return `${lieu} · Pas modifié depuis ${ans} an${ans > 1 ? 's' : ''}`;
}

/** Dernière recherche, gardée tant que Kernshine est ouvert (aussi lue par le bilan du Nettoyage). */
export const memoireGrosFichiers: { resultat: BigFileScan | null } = { resultat: null };
