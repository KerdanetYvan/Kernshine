import { useEffect, useRef, useState } from 'react';
import { ArrowsClockwiseIcon, CpuIcon, FilesIcon, LockIcon, MagnifyingGlassIcon, TrashIcon, WarningIcon, type Icon } from '@phosphor-icons/react';
import { Channel, invoke } from '@tauri-apps/api/core';
import type {
  Avancement, BigFileDeleteResult, BigFileProgress, BigFileScan, CleanResult, DiskSpace, DriverInstallResult, DriverProgress,
  DriverScan, HealthReport, MaintenanceScore, ScanResult, SoftwareScanResult, SwProgress,
} from '../../types/commands';
import { formatListe, formatOctets, pluriel } from '../../lib/format';
import { usePrefs } from '../../hooks/usePrefs';
import Bouton from '../ui/Bouton';
import FenetreConfirmation from '../ui/FenetreConfirmation';
import BilanEntretien from './BilanEntretien';
import ExecutionEntretien, { type ElementEnCours } from './ExecutionEntretien';
import FenetreEntretien from './FenetreEntretien';
import Recapitulatif from './Recapitulatif';
import { cle, choixParDefaut, zonesUtiles, type Choix, type StatutElement, type Trouve } from './donnees';
import { ETAPES, type Etape, type SuiviEtape } from './etapes';
import { disqueSysteme, problemesMateriel, type EntreeNote } from './note';

type Phase = 'analyse' | 'recap' | 'execution' | 'termine';

interface Vue {
  icone: Icon;
  valeur?: number;
  titre: string;
  detail: string;
  elements: ElementEnCours[];
}

interface EntretienProps {
  onFermer: () => void;
  /** Nouvelle note sur 100, après l'analyse puis après l'entretien. */
  onNote?: (note: MaintenanceScore) => void;
}

const VIDE: Choix = { zones: new Set(), fichiers: new Set(), applis: new Set(), pilotes: new Set() };
const paquet = (p: { id: string; name: string; currentVersion: string; availableVersion: string }) => ({
  id: p.id, name: p.name, currentVersion: p.currentVersion, availableVersion: p.availableVersion,
});
const disques = () => invoke<DiskSpace[]>('system_get_disks').catch(() => [] as DiskSpace[]);

/**
 * Entretien guidé, lancé depuis l'Accueil : analyse de tout, récapitulatif à cocher, puis
 * chaque étape à la suite. Rien ne se lance avant « Lancer l'entretien » ; les étapes
 * décochées dans les Paramètres sont ignorées. Réutilise les commandes des pages.
 */
export default function Entretien({ onFermer, onNote }: EntretienProps) {
  const { prefs, pret } = usePrefs();
  const [phase, setPhase] = useState<Phase>('analyse');
  const [suivi, setSuivi] = useState<Record<Etape, SuiviEtape>>(() =>
    Object.fromEntries(ETAPES.map((e) => [e.id, { etat: 'attente', detail: 'En attente' }])) as Record<Etape, SuiviEtape>,
  );
  const [vue, setVue] = useState<Vue>({ icone: MagnifyingGlassIcon, titre: 'Préparation…', detail: '', elements: [] });
  const [trouve, setTrouve] = useState<Trouve>({ zones: null, fichiers: null, applis: null, pilotes: null });
  const [choix, setChoix] = useState<Choix>(VIDE);
  const [statuts, setStatuts] = useState<Map<string, StatutElement>>(new Map());
  const [libere, setLibere] = useState(0);
  const [redemarrage, setRedemarrage] = useState(false);
  const [sansSauvegarde, setSansSauvegarde] = useState(false);
  const [confirmer, setConfirmer] = useState<'fichiers' | 'redemarrer' | null>(null);
  const [arretDemande, setArretDemande] = useState(false);
  const session = useRef(0);
  const arret = useRef(false);
  const sante = useRef<HealthReport | null>(null);
  const etapeCourante = useRef<Etape | null>(null);

  const maj = (e: Etape, etat: SuiviEtape['etat'], detail: string) => setSuivi((s) => ({ ...s, [e]: { etat, detail } }));
  const marquer = (k: string, s: StatutElement) => setStatuts((m) => new Map(m).set(k, s));

  const noter = async (entree: EntreeNote) => {
    try {
      // Le Rust attend des entiers (octets).
      const input = { ...entree, systemFreeBytes: Math.round(entree.systemFreeBytes), systemTotalBytes: Math.round(entree.systemTotalBytes), junkBytes: entree.junkBytes === null ? null : Math.round(entree.junkBytes) };
      onNote?.(await invoke<MaintenanceScore>('maintenance_score', { input }));
    } catch (e) {
      console.warn('note', e);
    }
  };

  // ── Analyse ──

  const analyser = async () => {
    const n = ++session.current;
    const vivant = () => session.current === n;
    const t: Trouve = { zones: null, fichiers: null, applis: null, pilotes: null };
    ETAPES.forEach((e) => !prefs[e.pref] && maj(e.id, 'ignoree', 'Décochée dans les Paramètres'));

    if (prefs.maintenanceCleaning) {
      maj('nettoyage', 'encours', 'Analyse en cours…');
      setVue({ icone: MagnifyingGlassIcon, titre: 'Analyse des fichiers inutiles…', detail: 'Windows, navigateurs et logiciels.', elements: [] });
      const canal = new Channel<Avancement>();
      canal.onmessage = (a) => vivant() && a.etape === 'debut' && setVue((v) => ({ ...v, detail: `${a.libelle} : ${a.description}` }));
      try {
        t.zones = (await invoke<ScanResult>('scan_get_zones', { onProgress: canal })).zones;
        const total = zonesUtiles(t.zones).reduce((s, z) => s + z.sizeBytes, 0);
        maj('nettoyage', 'faite', total > 0 ? `${formatOctets(total)} à libérer` : 'Rien à nettoyer');
      } catch (e) {
        console.warn('entretien : nettoyage', e);
        maj('nettoyage', 'ignoree', 'Analyse impossible');
      }
    }
    if (!vivant()) return;

    if (prefs.maintenanceBigfiles) {
      maj('grosfichiers', 'encours', 'Analyse en cours…');
      setVue({ icone: MagnifyingGlassIcon, titre: 'Analyse des gros fichiers…', detail: `Recherche des fichiers de plus de ${formatOctets(prefs.largeFileMinMb * 1024 * 1024)}.`, elements: [] });
      const canal = new Channel<BigFileProgress>();
      canal.onmessage = (a) => vivant() && a.etape !== 'disqueFini' && setVue((v) => ({ ...v, detail: `Recherche dans le disque ${a.drive}${a.etape === 'dossier' ? `, dossier ${a.folder}` : ''}…` }));
      try {
        const res = await invoke<BigFileScan>('bigfiles_scan', { minMb: prefs.largeFileMinMb, onProgress: canal });
        t.fichiers = res.files;
        const total = res.files.reduce((s, f) => s + f.sizeBytes, 0);
        maj('grosfichiers', 'faite', res.files.length > 0 ? `${res.files.length} ${pluriel(res.files.length, 'fichier')} · ${formatOctets(total)}` : 'Aucun');
      } catch (e) {
        console.warn('entretien : gros fichiers', e);
        maj('grosfichiers', 'ignoree', 'Analyse impossible');
      }
    }
    if (!vivant()) return;

    if (prefs.maintenanceApps) {
      maj('applications', 'encours', 'Analyse en cours…');
      setVue({ icone: MagnifyingGlassIcon, titre: 'Recherche des mises à jour des applications…', detail: 'Cela peut prendre une minute.', elements: [] });
      try {
        const res = await invoke<SoftwareScanResult>('updates_get_software');
        if (!res.ok) throw new Error(res.error);
        t.applis = res.data;
        maj('applications', 'faite', res.data.length > 0 ? `${res.data.length} ${pluriel(res.data.length, 'mise à jour', 'mises à jour')}` : 'Tout est à jour');
      } catch (e) {
        console.warn('entretien : applications', e);
        maj('applications', 'ignoree', 'Recherche impossible');
      }
    }
    if (!vivant()) return;

    if (prefs.maintenanceDrivers) {
      maj('pilotes', 'encours', 'Analyse en cours…');
      setVue({ icone: MagnifyingGlassIcon, titre: 'Recherche des pilotes…', detail: 'Windows Update regarde ce qui est disponible pour votre matériel.', elements: [] });
      try {
        const res = await invoke<DriverScan>('drivers_get');
        if (!res.ok) throw new Error(res.error);
        t.pilotes = res.data;
        maj('pilotes', 'faite', res.data.length > 0 ? `${res.data.length} ${pluriel(res.data.length, 'pilote')}` : 'Tout est à jour');
      } catch (e) {
        console.warn('entretien : pilotes', e);
        maj('pilotes', 'ignoree', 'Recherche impossible');
      }
    }
    if (!vivant()) return;

    // Santé du matériel et place libre, sans rien demander : pour la note sur 100.
    setVue({ icone: MagnifyingGlassIcon, titre: 'Dernières vérifications…', detail: 'État des disques, de la batterie et de la mémoire.', elements: [] });
    const [rapport, d] = await Promise.all([invoke<HealthReport>('health_check').catch(() => null), disques()]);
    if (!vivant()) return;
    sante.current = rapport;
    const systeme = disqueSysteme(d);
    const choixInitial = choixParDefaut(t);
    noter({
      systemFreeBytes: systeme?.freeBytes ?? 0,
      systemTotalBytes: systeme?.totalBytes ?? 0,
      junkBytes: t.zones ? zonesUtiles(t.zones).filter((z) => choixInitial.zones.has(z.id)).reduce((s, z) => s + z.sizeBytes, 0) : null,
      pendingUpdates: t.applis || t.pilotes ? (t.applis?.length ?? 0) + (t.pilotes?.length ?? 0) : null,
      healthIssues: rapport ? problemesMateriel(rapport) : null,
    });
    setTrouve(t);
    setChoix(choixInitial);
    setPhase('recap');
  };

  useEffect(() => {
    if (pret) analyser();
    const s = session;
    return () => {
      s.current++;
    };
    // L'analyse part une seule fois, quand les préférences sont lues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret]);

  const annuler = () => {
    session.current++;
    invoke('clean_stop').catch(() => {});
    invoke('bigfiles_stop').catch(() => {});
    onFermer();
  };

  // ── Entretien ──

  const lancer = async () => {
    setConfirmer(null);
    setPhase('execution');
    arret.current = false;
    setArretDemande(false);
    let liberes = 0;
    const faits = new Map<string, StatutElement>();
    const noterStatut = (k: string, s: StatutElement) => {
      faits.set(k, s);
      marquer(k, s);
    };
    const zones = zonesUtiles(trouve.zones ?? []).filter((z) => choix.zones.has(z.id));
    const fichiers = (trouve.fichiers ?? []).filter((f) => choix.fichiers.has(f.id));
    const applis = (trouve.applis ?? []).filter((a) => choix.applis.has(a.id));
    const pilotes = (trouve.pilotes ?? []).filter((p) => choix.pilotes.has(p.id));
    const sauter = (k: string[]) => k.forEach((x) => noterStatut(x, 'saute'));
    ETAPES.forEach((e) => {
      const rien = { nettoyage: zones, grosfichiers: fichiers, applications: applis, pilotes }[e.id].length === 0;
      if (rien) maj(e.id, 'ignoree', 'Rien de coché');
    });

    // 1. Nettoyage
    if (zones.length > 0 && !arret.current) {
      etapeCourante.current = 'nettoyage';
      const total = zones.reduce((s, z) => s + z.sizeBytes, 0);
      let fait = 0;
      maj('nettoyage', 'encours', '0 %');
      setVue({ icone: TrashIcon, valeur: 0, titre: 'Nettoyage…', detail: `${formatOctets(total)} à libérer. Ne fermez pas Kernshine pendant le nettoyage.`, elements: [] });
      const canal = new Channel<Avancement>();
      canal.onmessage = (a) => {
        if (a.etape === 'debut') setVue((v) => ({ ...v, titre: `Nettoyage : ${a.libelle}…` }));
        else if (a.etape === 'fin') {
          fait += a.octets;
          const pct = total > 0 ? Math.min(100, (fait / total) * 100) : 100;
          maj('nettoyage', 'encours', `${Math.round(pct)} %`);
          setVue((v) => ({ ...v, valeur: pct, detail: `${formatOctets(fait)} libérés sur ${formatOctets(total)}. Ne fermez pas Kernshine pendant le nettoyage.` }));
        } else setVue((v) => ({ ...v, detail: "Windows vous demande l'autorisation pour une partie du nettoyage." }));
      };
      try {
        const res = await invoke<CleanResult>('clean_zones', { ids: zones.map((z) => z.id), onProgress: canal });
        res.zones.forEach((z) => noterStatut(cle('z', z.id), z.status === 'ok' || z.status === 'partial' ? 'ok' : z.status === 'skipped' ? 'saute' : 'echec'));
        liberes += res.freedBytes;
        maj('nettoyage', 'faite', `${formatOctets(res.freedBytes)} libérés`);
      } catch (e) {
        console.warn('entretien : nettoyage', e);
        sauter(zones.map((z) => cle('z', z.id)));
        maj('nettoyage', 'ignoree', 'Pas fait');
      }
    }

    // 2. Gros fichiers (déjà confirmés : suppression définitive)
    if (fichiers.length > 0 && !arret.current) {
      etapeCourante.current = 'grosfichiers';
      maj('grosfichiers', 'encours', 'En cours…');
      setVue({ icone: FilesIcon, titre: `Suppression de ${fichiers.length} ${pluriel(fichiers.length, 'fichier')}…`, detail: 'Suppression définitive, comme vous l\'avez confirmé.', elements: [] });
      try {
        const res = await invoke<BigFileDeleteResult[]>('bigfiles_delete', { ids: fichiers.map((f) => f.id) });
        res.forEach((r) => noterStatut(cle('f', r.id), r.status === 'ok' ? 'ok' : 'echec'));
        const supprimes = res.filter((r) => r.status === 'ok');
        liberes += res.reduce((s, r) => s + r.freedBytes, 0);
        maj('grosfichiers', 'faite', `${supprimes.length} ${pluriel(supprimes.length, 'fichier supprimé', 'fichiers supprimés')}`);
      } catch (e) {
        console.warn('entretien : gros fichiers', e);
        sauter(fichiers.map((f) => cle('f', f.id)));
        maj('grosfichiers', 'ignoree', 'Pas fait');
      }
    }

    // 3. Applications
    if (applis.length > 0 && !arret.current) {
      etapeCourante.current = 'applications';
      const elements = new Map(applis.map((a) => [a.id, { cle: cle('a', a.id), nom: a.name, statut: 'attente' as StatutElement }]));
      const montrer = (titre: string) =>
        setVue({ icone: ArrowsClockwiseIcon, titre, detail: 'Chaque application est téléchargée puis installée. Windows peut vous demander l\'autorisation.', elements: [...elements.values()] });
      maj('applications', 'encours', `0 sur ${applis.length}`);
      montrer('Mise à jour des applications…');
      let faites = 0;
      const canal = new Channel<SwProgress>();
      canal.onmessage = (p) => {
        const e = elements.get(p.id);
        if (!e) return;
        const s: StatutElement =
          p.status === 'installing' ? 'encours' : p.status === 'skipped' ? 'saute' : p.status === 'ok' && p.verification !== 'still_outdated' ? 'ok' : 'echec';
        e.statut = s;
        if (s !== 'encours') {
          noterStatut(e.cle, s);
          faites++;
          maj('applications', 'encours', `${faites} sur ${applis.length}`);
        }
        montrer(s === 'encours' ? `Mise à jour de ${e.nom}…` : 'Mise à jour des applications…');
      };
      try {
        await invoke('updates_install_software_stream', { packages: applis.map(paquet), onProgress: canal });
      } catch (e) {
        console.warn('entretien : applications', e);
      }
      applis.forEach((a) => !faits.has(cle('a', a.id)) && noterStatut(cle('a', a.id), 'echec'));
      const ok = applis.filter((a) => faits.get(cle('a', a.id)) === 'ok').length;
      maj('applications', 'faite', `${ok} ${pluriel(ok, 'application')} à jour`);
    }

    // 4. Pilotes, un à la fois, avec la sauvegarde de sécurité si elle est réglée
    let aRedemarrer = false;
    let pasDeSauvegarde = false;
    if (pilotes.length > 0 && !arret.current) {
      etapeCourante.current = 'pilotes';
      const elements = new Map<string, ElementEnCours>();
      if (prefs.restoreBeforeDrivers) elements.set('sauvegarde', { cle: 'sauvegarde', nom: 'Sauvegarde de sécurité', statut: 'attente' });
      pilotes.forEach((p) => elements.set(p.id, { cle: cle('p', p.id), nom: p.name, statut: 'attente' }));
      let index = 0;
      const montrer = (titre: string) =>
        setVue({ icone: CpuIcon, titre, detail: `Étape ${Math.min(index + 1, elements.size)} sur ${elements.size}. Un seul pilote à la fois. L'écran peut clignoter un instant.`, elements: [...elements.values()] });
      maj('pilotes', 'encours', `Étape 1 sur ${elements.size}`);
      montrer(prefs.restoreBeforeDrivers ? 'Sauvegarde de sécurité…' : 'Mise à jour des pilotes…');
      const changer = (id: string, s: StatutElement) => {
        const e = elements.get(id);
        if (!e) return;
        e.statut = s;
        if (s === 'encours') {
          index = [...elements.keys()].indexOf(id);
          maj('pilotes', 'encours', `Étape ${index + 1} sur ${elements.size}`);
        } else if (id !== 'sauvegarde') noterStatut(e.cle, s);
        montrer(s === 'encours' ? (id === 'sauvegarde' ? 'Sauvegarde de sécurité…' : `Mise à jour : ${e.nom}…`) : 'Mise à jour des pilotes…');
      };
      const canal = new Channel<DriverProgress>();
      canal.onmessage = (a) => {
        if (a.etape === 'sauvegarde') changer('sauvegarde', 'encours');
        else if (a.etape === 'sauvegardeFaite') changer('sauvegarde', a.ok ? 'ok' : 'echec');
        else if (a.etape === 'debut') changer(a.id, 'encours');
        else if (a.etape === 'fin') {
          changer(a.id, a.ok ? 'ok' : 'echec');
          if (a.restart) aRedemarrer = true;
        } else changer(a.id, a.etape === 'saute' ? 'saute' : 'echec');
      };
      try {
        const res = await invoke<DriverInstallResult>('drivers_install', {
          ids: pilotes.map((p) => p.id),
          restore: prefs.restoreBeforeDrivers,
          requireRestore: true,
          onProgress: canal,
        });
        if (res.status === 'restore_failed') pasDeSauvegarde = true;
        aRedemarrer = aRedemarrer || res.restartNeeded;
      } catch (e) {
        console.warn('entretien : pilotes', e);
      }
      pilotes.forEach((p) => !faits.has(cle('p', p.id)) && noterStatut(cle('p', p.id), pasDeSauvegarde ? 'saute' : 'echec'));
      const ok = pilotes.filter((p) => faits.get(cle('p', p.id)) === 'ok').length;
      maj('pilotes', pasDeSauvegarde ? 'ignoree' : 'faite', pasDeSauvegarde ? 'Pas fait' : `${ok} ${pluriel(ok, 'pilote')} à jour`);
    }

    // Arrêt demandé : ce qui n'a pas commencé est « Pas fait ».
    [...zones.map((z) => cle('z', z.id)), ...fichiers.map((f) => cle('f', f.id)), ...applis.map((a) => cle('a', a.id)), ...pilotes.map((p) => cle('p', p.id))]
      .filter((k) => !faits.has(k))
      .forEach((k) => noterStatut(k, 'saute'));
    ETAPES.forEach((e) => setSuivi((s) => (s[e.id].etat === 'attente' ? { ...s, [e.id]: { etat: 'ignoree', detail: 'Arrêté' } } : s)));

    etapeCourante.current = null;
    setLibere(liberes);
    setRedemarrage(aRedemarrer);
    setSansSauvegarde(pasDeSauvegarde);
    setPhase('termine');

    // Nouvelle note : ce qui reste à faire après l'entretien.
    const systeme = disqueSysteme(await disques());
    const restant = <T extends { id: string }>(liste: T[], p: 'z' | 'a' | 'p') => liste.filter((x) => faits.get(cle(p, x.id)) !== 'ok');
    noter({
      systemFreeBytes: systeme?.freeBytes ?? 0,
      systemTotalBytes: systeme?.totalBytes ?? 0,
      junkBytes: trouve.zones ? restant(zonesUtiles(trouve.zones).filter((z) => z.risque === 'sans_risque'), 'z').reduce((s, z) => s + z.sizeBytes, 0) : null,
      pendingUpdates: trouve.applis || trouve.pilotes ? restant(trouve.applis ?? [], 'a').length + restant(trouve.pilotes ?? [], 'p').length : null,
      healthIssues: sante.current ? problemesMateriel(sante.current) : null,
    });
  };

  const arreter = () => {
    arret.current = true;
    setArretDemande(true);
    const stop = { nettoyage: 'clean_stop', grosfichiers: null, applications: 'updates_stop', pilotes: 'drivers_stop' } as const;
    const commande = etapeCourante.current ? stop[etapeCourante.current] : null;
    if (commande) invoke(commande).catch(() => {});
  };

  const masquerAppli = async (id: string) => {
    try {
      await invoke('updates_hide', { id });
      setTrouve((t) => ({ ...t, applis: (t.applis ?? []).filter((a) => a.id !== id) }));
      setChoix((c) => ({ ...c, applis: new Set([...c.applis].filter((x) => x !== id)) }));
    } catch (e) {
      console.warn('masquer', e);
    }
  };
  const masquerPilote = async (key: string) => {
    try {
      await invoke('drivers_hide', { key });
      const partis = (trouve.pilotes ?? []).filter((p) => p.key === key).map((p) => p.id);
      setTrouve((t) => ({ ...t, pilotes: (t.pilotes ?? []).filter((p) => p.key !== key) }));
      setChoix((c) => ({ ...c, pilotes: new Set([...c.pilotes].filter((x) => !partis.includes(x))) }));
    } catch (e) {
      console.warn('masquer', e);
    }
  };

  // ── Affichage ──

  const cadenas = (texte: string) => (
    <p className="flex w-full items-center justify-center gap-2 text-corps-petit text-secondary">
      <LockIcon className="size-4" aria-hidden />
      {texte}
    </p>
  );

  if (phase === 'analyse') {
    return (
      <FenetreEntretien
        titre="Analyse de votre PC"
        sousTitre="Rien n'est supprimé sans votre accord."
        action={{ libelle: 'Annuler', onClick: annuler }}
        suivi={suivi}
        pied={cadenas('Cela prend quelques minutes. Vous pourrez cocher ou décocher chaque étape avant de lancer l\'entretien.')}
      >
        <ExecutionEntretien {...vue} valeur={undefined} />
      </FenetreEntretien>
    );
  }

  if (phase === 'execution') {
    return (
      <FenetreEntretien
        titre="Entretien en cours"
        sousTitre="Vous pouvez laisser votre PC travailler."
        action={{ libelle: arretDemande ? 'Arrêt…' : 'Arrêter', onClick: arreter, disabled: arretDemande }}
        suivi={suivi}
        pied={cadenas('Ne fermez pas Kernshine et n\'éteignez pas votre PC pendant l\'entretien.')}
      >
        <ExecutionEntretien {...vue} />
      </FenetreEntretien>
    );
  }

  if (phase === 'termine') {
    const pilotesRedemarrage = (trouve.pilotes ?? []).filter((p) => p.needsRestart && statuts.get(cle('p', p.id)) === 'ok').map((p) => p.name);
    return (
      <>
        <FenetreEntretien
          titre={sansSauvegarde || [...statuts.values()].includes('echec') ? 'Entretien terminé' : 'Votre PC est à jour'}
          sousTitre="Voici ce qui a été fait. Faites défiler pour voir le détail."
          action={{ libelle: 'Fermer', onClick: onFermer }}
          suivi={suivi}
          pied={
            redemarrage && (
              <>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-corps-gras text-primary">Redémarrage conseillé</p>
                  <p className="text-corps-petit text-secondary">
                    {pilotesRedemarrage.length > 0 ? `Pour terminer l'installation des pilotes : ${formatListe(pilotesRedemarrage)}.` : "Pour terminer l'installation des pilotes."}
                  </p>
                </div>
                <Bouton onClick={() => setConfirmer('redemarrer')}>Redémarrer maintenant</Bouton>
              </>
            )
          }
        >
          <BilanEntretien trouve={trouve} choix={choix} statuts={statuts} libere={libere} redemarrage={redemarrage} sansSauvegarde={sansSauvegarde} />
        </FenetreEntretien>
        {confirmer === 'redemarrer' && (
          <FenetreConfirmation
            icone={ArrowsClockwiseIcon}
            titre="Redémarrer maintenant ?"
            texte="Enregistrez votre travail avant : les programmes ouverts seront fermés."
            libelleConfirmer="Redémarrer"
            onConfirmer={() => {
              setConfirmer(null);
              invoke<boolean>('system_restart').catch(() => {});
            }}
            onAnnuler={() => setConfirmer(null)}
          />
        )}
      </>
    );
  }

  // phase === 'recap'
  const zonesC = zonesUtiles(trouve.zones ?? []).filter((z) => choix.zones.has(z.id));
  const fichiersC = (trouve.fichiers ?? []).filter((f) => choix.fichiers.has(f.id));
  const octets = zonesC.reduce((s, z) => s + z.sizeBytes, 0) + fichiersC.reduce((s, f) => s + f.sizeBytes, 0);
  const resume = [
    octets > 0 && `${formatOctets(octets)} à libérer`,
    choix.applis.size > 0 && `${choix.applis.size} ${pluriel(choix.applis.size, 'application')}`,
    choix.pilotes.size > 0 && `${choix.pilotes.size} ${pluriel(choix.pilotes.size, 'pilote')}`,
  ].filter(Boolean);
  const rienTrouve =
    zonesUtiles(trouve.zones ?? []).length + (trouve.fichiers ?? []).length + (trouve.applis ?? []).length + (trouve.pilotes ?? []).length === 0;

  return (
    <>
      <FenetreEntretien
        titre="Voici ce qui a été trouvé"
        sousTitre="Cochez ou décochez chaque étape. Rien ne se lance avant votre accord."
        action={{ libelle: rienTrouve ? 'Fermer' : 'Annuler', onClick: onFermer }}
        suivi={suivi}
        pied={
          !rienTrouve && (
            <>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-corps-gras text-primary">{resume.length > 0 ? resume.join(' · ') : 'Rien de coché'}</p>
                <p className="text-corps-petit text-secondary">
                  {fichiersC.length > 0 ? 'Gros fichiers : suppression définitive, impossible à annuler' : 'Vous validez avant toute suppression.'}
                </p>
              </div>
              <Bouton onClick={() => (fichiersC.length > 0 ? setConfirmer('fichiers') : lancer())} disabled={resume.length === 0}>
                Lancer l'entretien
              </Bouton>
            </>
          )
        }
      >
        {rienTrouve ? (
          <p className="py-12 text-center text-corps text-secondary">Rien à faire : votre PC est déjà en ordre.</p>
        ) : (
          <Recapitulatif
            trouve={trouve}
            choix={choix}
            onChoix={setChoix}
            sauvegarde={prefs.restoreBeforeDrivers}
            onMasquerAppli={masquerAppli}
            onMasquerPilote={masquerPilote}
          />
        )}
      </FenetreEntretien>
      {confirmer === 'fichiers' && (
        <FenetreConfirmation
          icone={WarningIcon}
          chiffre={formatOctets(fichiersC.reduce((s, f) => s + f.sizeBytes, 0))}
          titre={`Supprimer ${fichiersC.length} ${pluriel(fichiersC.length, 'fichier')} définitivement ?`}
          texte={`${fichiersC.length > 1 ? 'Ils ne passent' : 'Il ne passe'} pas par la corbeille : vous ne pourrez pas ${fichiersC.length > 1 ? 'les' : 'le'} récupérer.`}
          danger
          libelleConfirmer="Supprimer définitivement"
          onConfirmer={lancer}
          onAnnuler={() => setConfirmer(null)}
        >
          <ul className="flex flex-col gap-3 rounded-lg border bg-neutre px-4 py-3">
            {fichiersC.slice(0, 5).map((f) => (
              <li key={f.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-left text-corps-gras text-primary">{f.name}</span>
                <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(f.sizeBytes)}</span>
              </li>
            ))}
            {fichiersC.length > 5 && (
              <li className="text-left text-corps-petit text-secondary">
                et {fichiersC.length - 5} {pluriel(fichiersC.length - 5, 'autre fichier', 'autres fichiers')}
              </li>
            )}
          </ul>
        </FenetreConfirmation>
      )}
    </>
  );
}
