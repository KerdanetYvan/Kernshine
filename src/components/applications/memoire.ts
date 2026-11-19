import type { SoftwareScanResult } from '../../types/commands';

/**
 * Dernière recherche de mises à jour, gardée tant que Kernshine est ouvert : revenir sur
 * l'onglet réaffiche la liste (« Dernière vérification il y a 5 min ») sans relancer la recherche.
 */
export const derniereRecherche: { resultat: SoftwareScanResult | null; quand: number } = {
  resultat: null,
  quand: 0,
};
