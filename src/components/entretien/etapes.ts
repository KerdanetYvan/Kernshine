import type { Prefs } from '../../types/commands';

export type Etape = 'nettoyage' | 'grosfichiers' | 'applications' | 'pilotes';

export const ETAPES: { id: Etape; nom: string; pref: keyof Prefs }[] = [
  { id: 'nettoyage', nom: 'Nettoyage', pref: 'maintenanceCleaning' },
  { id: 'grosfichiers', nom: 'Gros fichiers', pref: 'maintenanceBigfiles' },
  { id: 'applications', nom: 'Applications', pref: 'maintenanceApps' },
  { id: 'pilotes', nom: 'Pilotes', pref: 'maintenanceDrivers' },
];

/** État d'une étape dans la frise : en attente, en cours, faite, ignorée (décochée ou impossible). */
export type EtatEtape = 'attente' | 'encours' | 'faite' | 'ignoree';

export interface SuiviEtape {
  etat: EtatEtape;
  /** « 38 Go à libérer », « En attente »… */
  detail: string;
}
