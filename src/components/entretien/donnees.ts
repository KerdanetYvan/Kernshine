import type { BigFile, Driver, SoftwareUpdate, ZoneInfo } from '../../types/commands';

/** Ce que l'analyse a trouvé. `null` : étape décochée dans les Paramètres ou analyse impossible. */
export interface Trouve {
  zones: ZoneInfo[] | null;
  fichiers: BigFile[] | null;
  applis: SoftwareUpdate[] | null;
  pilotes: Driver[] | null;
}

/** Ce que l'utilisateur a coché, par étape (identifiants des commandes). */
export interface Choix {
  zones: Set<string>;
  fichiers: Set<string>;
  applis: Set<string>;
  pilotes: Set<string>;
}

export type StatutElement = 'attente' | 'encours' | 'ok' | 'echec' | 'saute';

/** Clé d'un élément, unique entre les étapes (« z:temp », « a:Mozilla.Firefox »…). */
export const cle = (etape: 'z' | 'f' | 'a' | 'p', id: string) => `${etape}:${id}`;

/** Zones affichées : celles qui ont quelque chose à nettoyer. */
export const zonesUtiles = (zones: ZoneInfo[]) => zones.filter((z) => z.sizeBytes > 0);

/** Choix par défaut, comme dans les pages : zones « Sans risque », aucun gros fichier
 * (suppression définitive), applications fermées, tous les pilotes. */
export function choixParDefaut(t: Trouve): Choix {
  return {
    zones: new Set(zonesUtiles(t.zones ?? []).filter((z) => z.risque === 'sans_risque').map((z) => z.id)),
    fichiers: new Set(),
    applis: new Set((t.applis ?? []).filter((a) => !a.open).map((a) => a.id)),
    pilotes: new Set((t.pilotes ?? []).map((p) => p.id)),
  };
}

export const basculer = (ensemble: Set<string>, ids: string[], coche: boolean) => {
  const next = new Set(ensemble);
  ids.forEach((id) => (coche ? next.add(id) : next.delete(id)));
  return next;
};

/** État de la case d'un groupe. */
export const etatGroupe = (ids: string[], choisis: Set<string>): boolean | 'partiel' => {
  const n = ids.filter((id) => choisis.has(id)).length;
  return n === 0 ? false : n === ids.length ? true : 'partiel';
};
