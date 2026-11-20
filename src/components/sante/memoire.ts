import type { GpuTemperature, HealthReport, WearResult } from '../../types/commands';

/**
 * Dernière vérification, gardée tant que Kernshine est ouvert : revenir sur la page
 * réaffiche les résultats (« Dernière vérification il y a 5 min ») sans relancer.
 */
export const memoireSante: {
  rapport: HealthReport | null;
  /** Températures des cartes graphiques à la dernière lecture. */
  gpus: GpuTemperature[];
  /** Usure lue avec l'autorisation de l'utilisateur, si elle l'a été. */
  usure: WearResult | null;
  quand: number;
} = { rapport: null, gpus: [], usure: null, quand: 0 };
