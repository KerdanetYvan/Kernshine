import type { BatteryHealth, DiskHealth, DiskWear, GpuTemperature, MemoryTest } from '../../types/commands';
import type { Statut } from '../ui/Pastille';

/** Ce que la carte affiche, et la phrase du résumé quand c'est à surveiller. */
export interface Evaluation {
  statut: Statut;
  etat: string;
  conseil?: string;
  /** « votre disque C: vieillit » : repris dans le résumé en haut de la page. */
  point?: string;
}

/** Au-delà, une carte graphique « chauffe » (la plupart ralentissent vers 83-87 °C). */
export const GPU_CHAUD = 83;

export function evaluerDisque(d: DiskHealth, usure?: DiskWear): Evaluation {
  const w = usure?.wear ?? null;
  if (d.state === 'bad' || (w !== null && w >= 90)) {
    return {
      statut: 'corriger',
      etat: 'À remplacer',
      conseil: 'Il est très usé : sauvegardez vos fichiers importants et prévoyez de le remplacer.',
      point: `votre disque ${d.letter} est à remplacer`,
    };
  }
  if (d.state === 'warning' || (w !== null && w >= 70)) {
    return {
      statut: 'surveiller',
      etat: 'Vieillissant',
      conseil: "Il vieillit : sauvegardez vos fichiers importants avant qu'il ne tombe en panne.",
      point: `votre disque ${d.letter} vieillit`,
    };
  }
  if (d.state === 'unknown' && w === null) return { statut: 'neutre', etat: 'Non communiqué' };
  return { statut: 'ok', etat: 'Bon état' };
}

/** Usure de la batterie en % (capacité perdue depuis l'origine). */
export const usureBatterie = (b: BatteryHealth) => Math.max(0, Math.round((1 - b.fullMwh / b.designMwh) * 100));

export function evaluerBatterie(b: BatteryHealth): Evaluation {
  const u = usureBatterie(b);
  if (u >= 50) {
    return {
      statut: 'corriger',
      etat: 'Très usée',
      conseil: "Elle a perdu plus de la moitié de sa capacité : son remplacement redonnerait de l'autonomie.",
      point: 'la batterie est très usée',
    };
  }
  if (u >= 30) {
    return {
      statut: 'surveiller',
      etat: 'Usée',
      conseil: "Elle tient moins longtemps qu'à l'origine : c'est normal avec les années.",
      point: "la batterie s'use",
    };
  }
  return { statut: 'ok', etat: 'Bon état' };
}

export function evaluerTemperature(gpus: GpuTemperature[]): Evaluation {
  const chaude = gpus.find((g) => g.celsius >= GPU_CHAUD);
  if (chaude) {
    return {
      statut: 'surveiller',
      etat: 'Chaud',
      conseil: 'La carte graphique chauffe : vérifiez que les aérations ne sont pas bouchées.',
      point: 'la carte graphique chauffe',
    };
  }
  return { statut: 'ok', etat: 'Normal' };
}

export function evaluerMemoire(test: MemoryTest | null): Evaluation {
  if (test?.errors) {
    return {
      statut: 'corriger',
      etat: 'Erreurs',
      conseil: 'Le test de Windows a trouvé des erreurs : faites vérifier la mémoire par un réparateur.',
      point: 'la mémoire a des erreurs',
    };
  }
  return { statut: 'ok', etat: 'Normal' };
}

/** Le plus grave des états (pour la pastille « Matériel »). */
export function pire(statuts: Statut[]): Statut {
  if (statuts.includes('corriger')) return 'corriger';
  if (statuts.includes('surveiller')) return 'surveiller';
  return 'ok';
}
