import type { SoftwareUpdate } from '../../types/commands';

/** « 24.2 → 24.5 », ou « Version inconnue → 24.5 ». */
export const versions = (p: SoftwareUpdate) =>
  `${p.versionUnknown ? 'Version inconnue' : p.currentVersion} → ${p.availableVersion}`;

/** Cochées d'office (page Applications et entretien guidé) : version lisible, application
 * fermée, et pas déjà installée sans effet. */
export const cocheeDOffice = (p: SoftwareUpdate) => !p.versionUnknown && !p.open && !p.stuck;

/** Conseil pour une mise à jour déjà installée sans effet. */
export const CONSEIL_BLOQUEE =
  "Déjà installée sans effet : mettez-la plutôt à jour depuis l'application elle-même.";
