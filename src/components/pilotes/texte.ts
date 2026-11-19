import type { Driver } from '../../types/commands';

const dateLongue = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Versions d'un pilote : « 551.23 → 561.09 » quand Windows donne les deux, sinon ce qu'on
 * sait (« Version du 16 octobre 2026 »).
 */
export function versionsPilote(d: Driver): string {
  if (d.currentVersion && d.newVersion) return `${d.currentVersion} → ${d.newVersion}`;
  if (d.newVersion) return `Nouvelle version ${d.newVersion}`;
  if (d.date && d.currentVersion) return `${d.currentVersion} → version du ${dateLongue(d.date)}`;
  if (d.date) return `Version du ${dateLongue(d.date)}`;
  return d.currentVersion ? `Version actuelle ${d.currentVersion}` : 'Nouvelle version disponible';
}
