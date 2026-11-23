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
  /** Cette version s'est déjà installée plusieurs fois sans effet : décochée d'office. */
  stuck: boolean;
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
  /** Version déjà refusée pour ce PC : proposée de nouveau à la version suivante. */
  incompatible: SoftwareUpdate[];
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
  /** Taille à partir de laquelle un fichier est « gros », en Mo : 100, 500, 1024 ou 5120. */
  largeFileMinMb: number;
  /** Étapes incluses dans l'entretien (Paramètres > Entretien), toutes cochées par défaut. */
  maintenanceCleaning: boolean;
  maintenanceBigfiles: boolean;
  maintenanceApps: boolean;
  maintenanceDrivers: boolean;
}

// ── Entretien (maintenance.rs) ───────────────────────────────────────────────

export interface ScorePart {
  id: 'space' | 'junk' | 'updates' | 'health';
  points: number;
  max: number;
}

/** Note sur 100 de la dernière analyse de l'entretien. */
export interface MaintenanceScore {
  value: number;
  state: 'ok' | 'surveiller' | 'corriger';
  parts: ScorePart[];
  /** Secondes depuis 1970. */
  date: number;
}

// ── Gros fichiers (bigfiles.rs) ──────────────────────────────────────────────

export type GenreFichier = 'video' | 'archive' | 'image_disque' | 'installateur' | 'image' | 'audio' | 'document' | 'autre';

/** Un gros fichier trouvé par la recherche. */
export interface BigFile {
  /** Identifiant de la dernière recherche, seul envoyé pour supprimer. */
  id: string;
  name: string;
  /** « C: » */
  drive: string;
  /** « Vidéos », « Vacances » */
  location: string[];
  sizeBytes: number;
  /** Jours depuis la dernière modification. */
  daysSinceModified: number | null;
  kind: GenreFichier;
}

export interface BigFileScan {
  ok: boolean;
  files: BigFile[];
  drives: string[];
  stopped: boolean;
}

export type BigFileProgress =
  | { etape: 'disque'; drive: string }
  | { etape: 'dossier'; drive: string; folder: string }
  | { etape: 'disqueFini'; drive: string; files: number; bytes: number };

export interface BigFileDeleteResult {
  id: string;
  /** `changed` : le fichier a changé depuis la recherche ; `in_use` : ouvert dans un programme. */
  status: 'ok' | 'changed' | 'missing' | 'in_use' | 'denied' | 'unknown';
  freedBytes: number;
}

// ── Désinstallation (uninstall.rs) ───────────────────────────────────────────

/** Un programme installé que l'utilisateur peut désinstaller. */
export interface InstalledProgram {
  /** Identifiant de la dernière liste, seul envoyé pour désinstaller. */
  id: string;
  name: string;
  publisher: string | null;
  /** « 2024-03 » : mois d'installation, s'il est connu. */
  installed: string | null;
  sizeBytes: number | null;
  /** « C: » */
  drive: string | null;
  /** Taille inconnue de Windows : Kernshine mesure le dossier (`uninstall_sizes`). */
  measuring: boolean;
}

export interface ProgramList {
  programs: InstalledProgram[];
  /** Composants nécessaires à Windows ou aux programmes, non proposés. */
  components: number;
}

/** Taille mesurée par `uninstall_sizes`, reçue au fil de l'eau (`null` : pas mesurable). */
export interface MeasuredSize {
  id: string;
  sizeBytes: number | null;
}

/**
 * `removed` : retiré du PC ; `still_there` : fenêtre fermée ou désinstallation annulée ;
 * `refused` : autorisation de Windows refusée ; `error` : l'outil ne s'est pas lancé ;
 * `missing` : plus dans la liste ; `skipped` : arrêt demandé avant lui.
 */
export type UninstallStatus = 'removed' | 'still_there' | 'refused' | 'error' | 'missing' | 'skipped';

export interface UninstallProgress {
  id: string;
  status: 'running' | UninstallStatus;
}

export interface UninstallResult {
  id: string;
  status: UninstallStatus;
}

/** Étapes de `selfupdate_install`, reçues au fil de l'eau. */
export type SelfUpdateEvent =
  | { step: 'downloading'; downloaded: number; total?: number | null }
  | { step: 'installing' };

export interface SelfUpdateResult {
  ok: boolean;
  error?: string;
}

// ── Santé (health.rs) ────────────────────────────────────────────────────────

export interface DiskHealth {
  /** « C: » */
  letter: string;
  /** Disque physique (plusieurs lettres peuvent le partager). */
  diskNumber: number;
  kind: 'ssd' | 'hdd' | null;
  /** État donné par Windows. */
  state: 'ok' | 'warning' | 'bad' | 'unknown';
  totalBytes: number;
  freeBytes: number;
}

export interface MemoryTest {
  /** Date du dernier test de la mémoire de Windows (secondes depuis 1970). */
  date: number;
  errors: boolean;
}

export interface BatteryHealth {
  designMwh: number;
  fullMwh: number;
  cycles: number | null;
}

export interface HealthReport {
  disks: DiskHealth[];
  /** `null` si le test de la mémoire de Windows n'a jamais été lancé. */
  memoryTest: MemoryTest | null;
  /** `null` sur un PC sans batterie. */
  battery: BatteryHealth | null;
}

export interface GpuTemperature {
  name: string;
  celsius: number;
}

export interface DiskWear {
  diskNumber: number;
  /** `null` : le disque ne la communique pas. */
  wear: number | null;
  celsius: number | null;
}

export interface WearResult {
  /** `false` si l'autorisation a été refusée. */
  ok: boolean;
  disks: DiskWear[];
}
