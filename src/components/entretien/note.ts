import type { DiskSpace, HealthReport } from '../../types/commands';
import { evaluerBatterie, evaluerDisque, evaluerMemoire } from '../sante/evaluation';

/** Entrée de `maintenance_score` (voir `maintenance.rs`). `null` : part non comptée. */
export interface EntreeNote {
  systemFreeBytes: number;
  systemTotalBytes: number;
  junkBytes: number | null;
  pendingUpdates: number | null;
  /** (à corriger, à surveiller) */
  healthIssues: [number, number] | null;
}

/** Disque de Windows : C: s'il existe, sinon le premier. */
export const disqueSysteme = (disques: DiskSpace[]) => disques.find((d) => d.letter === 'C:') ?? disques[0];

/** Problèmes de matériel vus par la page Santé (sans l'usure, qui demande l'autorisation). */
export function problemesMateriel(r: HealthReport): [number, number] {
  const statuts = [
    ...r.disks.map((d) => evaluerDisque(d).statut),
    ...(r.battery ? [evaluerBatterie(r.battery).statut] : []),
    evaluerMemoire(r.memoryTest).statut,
  ];
  return [statuts.filter((s) => s === 'corriger').length, statuts.filter((s) => s === 'surveiller').length];
}

/** Ce qui compose la note sur 100, pour l'expliquer sous la note (Accueil, #54). */
export const PARTS_NOTE: Record<'space' | 'junk' | 'updates' | 'health', { nom: string; explication: string }> = {
  space: { nom: 'Place libre', explication: "30 points avec un quart du disque de Windows libre ou plus, 0 sous 5 % : Windows ralentit quand il manque de place." },
  junk: { nom: 'Fichiers inutiles', explication: '20 points sans fichier inutile à nettoyer, 0 à partir de 20 Go.' },
  updates: { nom: 'Mises à jour', explication: '25 points sans mise à jour en attente (applications et pilotes), 5 de moins par mise à jour.' },
  health: { nom: 'Santé du matériel', explication: '25 points si les disques, la batterie et la mémoire vont bien, 10 de moins par point à surveiller.' },
};
