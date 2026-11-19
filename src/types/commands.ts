export interface CPU {
  model: string;
  speed: number;
}

export interface StatPoint {
  timestamp:    number;
  cpuPercent:   number;
  freeMemoryGB: number;
}

export interface UserInfo {
  username: string;
  uid: number;
  gid: number;
  shell: string;
  homedir: string;
}

export interface SystemInfo {
  osType: string;
  platform: string;
  release: string;
  arch: string;
  hostname: string;
  cpus:            CPU[];
  cpuUsagePercent: number;
  memoryGB:        number;
  freeMemoryGB: number;
  uptimeHours:  number;
  userInfo:     UserInfo;
  statsHistory: StatPoint[];
}

// ── Nettoyage (scan.rs) ──────────────────────────────────────────────────────

export type GroupeZone = 'windows' | 'navigateurs' | 'applications' | 'autres';
/** « Sans risque » est coché d'office ; « À vérifier » attend que l'utilisateur coche. */
export type RisqueZone = 'sans_risque' | 'a_verifier';

/** Une zone que Kernshine sait nettoyer (liste fermée côté Rust). */
export interface ZoneInfo {
  id: string;
  groupe: GroupeZone;
  libelle: string;
  description: string;
  risque: RisqueZone;
  sizeBytes: number;
  fileCount: number;
  requiresAdmin: boolean;
  lockedByProcess?: string;
}

export interface ScanResult {
  ok: boolean;
  zones: ZoneInfo[];
  runningApps: string[];
}

/** Avancement de l'analyse et du nettoyage, reçu par un Channel. */
export type Avancement =
  | { etape: 'debut'; id: string; libelle: string; description: string }
  | { etape: 'fin'; id: string; octets: number }
  | { etape: 'autorisation' };

export interface ZoneCleanResult {
  id: string;
  /** `skipped` : arrêt demandé avant cette zone ; `refused` : zone inconnue. */
  status: 'ok' | 'partial' | 'failed' | 'skipped' | 'refused';
  freedBytes: number;
}

export interface CleanResult {
  ok: boolean;
  stopped: boolean;
  freedBytes: number;
  zones: ZoneCleanResult[];
}

/** Un disque interne et sa place libre (system_get_disks). */
export interface DiskSpace {
  /** « C: » */
  letter: string;
  totalBytes: number;
  freeBytes: number;
}

export interface SoftwareUpdate {
  id: string;
  name: string;
  currentVersion: string;
  availableVersion: string;
  source: string;
  /** Version installée illisible : le programme réapparaît à chaque analyse. */
  versionUnknown: boolean;
  /** L'application semble ouverte : décochée d'office, avec un bouton pour la fermer. */
  open: boolean;
}

// ── Pilotes (drivers.rs) ─────────────────────────────────────────────────────

/** Un pilote proposé par Windows Update. */
export interface Driver {
  /** Identifiant Windows Update, seul envoyé pour l'installation. */
  id: string;
  /** Clé pour « Ne plus proposer ». */
  key: string;
  /** Nom simple : « Carte graphique NVIDIA ». */
  name: string;
  currentVersion: string | null;
  newVersion: string | null;
  /** Date du nouveau pilote (AAAA-MM-JJ). */
  date: string | null;
  sizeBytes: number;
  needsRestart: boolean;
}

export interface DriverScan {
  ok: boolean;
  data: Driver[];
  hiddenCount: number;
  error?: string;
}

/** Avancement de l'installation des pilotes, reçu par un Channel. */
export type DriverProgress =
  | { etape: 'sauvegarde' }
  | { etape: 'sauvegardeFaite'; ok: boolean }
  | { etape: 'debut'; id: string }
  | { etape: 'fin'; id: string; ok: boolean; restart: boolean }
  | { etape: 'saute'; id: string }
  | { etape: 'absent'; id: string };

export interface DriverInstallResult {
  /** `restore_failed` : rien installé, faute de point de restauration ; `refused` : autorisation refusée. */
  status: 'done' | 'restore_failed' | 'refused' | 'error';
  restorePoint: boolean;
  restartNeeded: boolean;
}

/** Analyse des logiciels : la liste proposée, et à part les programmes que l'utilisateur a masqués. */
export interface SoftwareScanResult {
  ok: boolean;
  data: SoftwareUpdate[];
  hidden: SoftwareUpdate[];
  error?: string;
}

export interface ServiceInfo {
  name:        string;
  label:       string;
  description: string;
  status:      string;   // 'Running' | 'Stopped' | 'Disabled' | 'Unknown'
  startType:   string;   // 'Automatic' | 'Manual' | 'Disabled' | 'Unknown'
  hasIssue:    boolean;
}

export interface ServiceScanResult {
  ok:     boolean;
  data:   ServiceInfo[];
  error?: string;
}

export interface RepairResult {
  ok:     boolean;
  fixed:  number;
  errors: number;
}

export interface SFCResult {
  ok:      boolean;
  status:  'healthy' | 'repaired' | 'failed' | 'unknown';
  excerpt: string;
}

export interface DriverError {
  name:        string;
  instanceId:  string;
  status:      string;
  deviceClass: string;
}

export interface DriverErrorScanResult {
  ok:     boolean;
  data:   DriverError[];
  error?: string;
}

export interface RegistryIssue {
  name:            string;
  installLocation: string;
  registryPath:    string;
}

export interface RegistryScanResult {
  ok:     boolean;
  data:   RegistryIssue[];
  error?: string;
}

export interface StartupItem {
  name:    string;
  command: string;
  enabled: boolean;
  /** `user` : lancé pour ce compte ; `system` : pour tous les comptes (autorisation de Windows). */
  source:  'user' | 'system';
  /** Nécessaire au bon fonctionnement : affiché verrouillé, avec ce nom et cette description. */
  essential: { label: string; description: string } | null;
}

export interface StartupScanResult {
  ok:     boolean;
  data:   StartupItem[];
  error?: string;
}

export interface StartupChange {
  name:    string;
  source:  'user' | 'system';
  enabled: boolean;
}

export interface DiskVolumeInfo {
  letter:       string;
  label:        string;
  sizeGB:       number;
  freeGB:       number;
  healthStatus: string;
}

export interface DiskDevice {
  name:         string;
  healthStatus: string;
  sizeGB:       number;
  volumes:      DiskVolumeInfo[];
}

export interface DiskHealthResult {
  ok:     boolean;
  disks:  DiskDevice[];
  error?: string;
}

export interface Ack {
  ok: boolean;
}

export interface SettingsInfo {
  version: string;
  openAtLogin: boolean;
}

/** Résultat de la relecture de la version après une installation réussie. */
export type Verification = 'confirmed' | 'still_outdated' | 'unverifiable';

/** Type d'échec d'une installation : dit à l'interface quel bouton proposer. */
export type FailureKind = 'needs_permission' | 'close_app' | 'retry_later' | 'update_manually' | 'other';

export interface SwProgress {
  id: string;
  /** `skipped` : arrêt demandé avant ce programme, rien n'a été installé. */
  status: 'installing' | 'ok' | 'error' | 'skipped';
  reason?: string;
  kind?: FailureKind;
  reboot?: 'app' | 'system';
  verification?: Verification;
  /** Vrai quand l'installation dure (plus d'une minute) : à signaler à l'utilisateur. */
  slow?: boolean;
}

export interface StreamResult {
  logFile: string | null;
}

export interface ElevatedInstallResult {
  ok: boolean;
  reason?: string;
  kind?: FailureKind;
  reboot?: 'app' | 'system';
  verification?: Verification;
  logFile?: string;
}

export interface CloseAppResult {
  ok: boolean;
  processName?: string;
  /** `still_open` : fermée comme avec sa croix, elle tourne encore (zone de notification). */
  reason?: 'not_found' | 'ambiguous' | 'error' | 'still_open';
  candidates?: string[];
}

/** Mise à jour de Kernshine lui-même (`selfupdate_check`). */
export interface SelfUpdateCheck {
  ok: boolean;
  /** Une version plus récente est disponible. */
  available: boolean;
  version?: string;
  /** Nouveautés de la version (extrait du CHANGELOG). */
  notes?: string;
  /** Installé pour tous les utilisateurs : Windows demandera l'autorisation. */
  needsPermission: boolean;
  error?: string;
}

/** Préférences de l'utilisateur (`settings_get_prefs`, `settings_set_prefs`). */
export interface Prefs {
  /** Installer les nouvelles versions de Kernshine sans attendre un clic (désactivé par défaut). */
  autoUpdate: boolean;
  /** Créer un point de restauration avant d'installer des pilotes (activé par défaut). */
  restoreBeforeDrivers: boolean;
}

/** Étapes de `selfupdate_install`, reçues au fil de l'eau. */
export type SelfUpdateEvent =
  | { step: 'downloading'; downloaded: number; total?: number | null }
  | { step: 'installing' };

export interface SelfUpdateResult {
  ok: boolean;
  error?: string;
}
