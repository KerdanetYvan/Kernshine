import type { SoftwareUpdate } from '../../types/commands';

/** « 24.2 → 24.5 », ou « Version inconnue → 24.5 ». */
export const versions = (p: SoftwareUpdate) =>
  `${p.versionUnknown ? 'Version inconnue' : p.currentVersion} → ${p.availableVersion}`;
