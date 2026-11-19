import { useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, DevicesIcon, GearSixIcon, GhostIcon, HardDriveIcon, MagnifyingGlassIcon, ShieldCheckIcon, WarningIcon, type Icon } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import type { Ack, DiskHealthResult, DriverErrorScanResult, RegistryScanResult, RepairResult, ServiceScanResult, SFCResult } from '../types/commands';
import { depuis, formatListe, pluriel } from '../lib/format';
import Bouton from '../components/ui/Bouton';
import BoutonScan from '../components/ui/BoutonScan';
import Carte from '../components/ui/Carte';
import EnTetePage from '../components/ui/EnTetePage';
import Pastille, { type Statut } from '../components/ui/Pastille';
import ProgressionCirculaire from '../components/ui/ProgressionCirculaire';
import LigneReparation, { type ActionReparation } from '../components/reparation/LigneReparation';

type Phase = 'accueil' | 'analyse' | 'resultats';
type ZoneId = 'services' | 'peripheriques' | 'fantomes' | 'disques';

/** Résultat d'une zone, tel qu'affiché : état, explication, et ce qu'il faut pour réparer. */
interface Constat {
  etat: 'ok' | 'corriger' | 'erreur';
  description: string;
  /** Résumé pour la carte du haut (« un programme essentiel de Windows est arrêté »). */
  resume?: string;
  /** Ce que la réparation envoie au Rust (noms de services, identifiants, chemins, lettres). */
  cibles: string[];
  /** Vérification des disques prévue au prochain redémarrage. */
  prevue?: boolean;
}

interface Zone {
  id: ZoneId;
  nom: string;
  icone: Icon;
  /** Ce que vérifie la zone, affiché pendant l'analyse. */
  pendant: string;
  analyser: () => Promise<Constat>;
}

const ERREUR_ANALYSE: Constat = { etat: 'erreur', description: "La vérification n'a pas pu se faire. Réessayez.", cibles: [] };

const ZONES: Zone[] = [
  {
    id: 'services',
    nom: 'Programmes essentiels de Windows',
    icone: GearSixIcon,
    pendant: "Ceux qui font marcher l'impression, le son, le réseau et les mises à jour.",
    analyser: async () => {
      const res = await invoke<ServiceScanResult>('repair_get_services');
      if (!res.ok) return ERREUR_ANALYSE;
      const ko = res.data.filter((s) => s.hasIssue);
      if (ko.length === 0) return { etat: 'ok', description: 'Ils fonctionnent tous normalement.', cibles: [] };
      const noms = formatListe(ko.map((s) => s.label), 4);
      return {
        etat: 'corriger',
        description: `${noms} ${ko.length > 1 ? 'ne fonctionnent pas' : 'ne fonctionne pas'} comme prévu.`,
        resume: ko.length > 1 ? `${ko.length} programmes essentiels de Windows sont arrêtés` : 'un programme essentiel de Windows est arrêté',
        cibles: ko.map((s) => s.name),
      };
    },
  },
  {
    id: 'peripheriques',
    nom: 'Composants et périphériques',
    icone: DevicesIcon,
    pendant: 'Carte graphique, son, ports USB et autres composants.',
    analyser: async () => {
      const res = await invoke<DriverErrorScanResult>('repair_get_driver_errors');
      if (!res.ok) return ERREUR_ANALYSE;
      if (res.data.length === 0) return { etat: 'ok', description: 'Tous vos composants fonctionnent normalement.', cibles: [] };
      const n = res.data.length;
      return {
        etat: 'corriger',
        description: `${formatListe(res.data.map((d) => d.name), 4)} ${n > 1 ? 'ne fonctionnent pas' : 'ne fonctionne pas'} correctement.`,
        resume: n > 1 ? `${n} périphériques ne fonctionnent pas` : 'un périphérique ne fonctionne pas',
        cibles: res.data.map((d) => d.instanceId),
      };
    },
  },
  {
    id: 'fantomes',
    nom: 'Programmes fantômes',
    icone: GhostIcon,
    pendant: 'Programmes déjà désinstallés que Windows affiche encore.',
    analyser: async () => {
      const res = await invoke<RegistryScanResult>('repair_get_registry_issues');
      if (!res.ok) return ERREUR_ANALYSE;
      if (res.data.length === 0) return { etat: 'ok', description: 'Programmes déjà désinstallés que Windows affiche encore. Aucun trouvé.', cibles: [] };
      const n = res.data.length;
      return {
        etat: 'corriger',
        description: `${n > 1 ? `${n} programmes déjà désinstallés apparaissent` : 'Un programme déjà désinstallé apparaît'} encore dans la liste de Windows : ${formatListe(res.data.map((r) => r.name), 4)}.`,
        resume: n > 1 ? `${n} programmes fantômes encombrent la liste de Windows` : 'un programme fantôme encombre la liste de Windows',
        cibles: res.data.map((r) => r.registryPath),
      };
    },
  },
  {
    id: 'disques',
    nom: 'Disques',
    icone: HardDriveIcon,
    pendant: "L'état de santé de vos disques.",
    analyser: async () => {
      const res = await invoke<DiskHealthResult>('repair_get_disk_health');
      if (!res.ok) return ERREUR_ANALYSE;
      const nomDisque = (d: (typeof res.disks)[number]) =>
        d.volumes.length > 0 ? formatListe(d.volumes.map((v) => `Disque ${v.letter}:`)) : d.name;
      const ko = res.disks.filter((d) => d.healthStatus !== 'Healthy');
      if (ko.length === 0) {
        const tous = res.disks.map(nomDisque);
        return {
          etat: 'ok',
          description: tous.length > 0 ? `${formatListe(tous)} ${tous.length > 1 ? 'sont' : 'est'} en bon état.` : 'Vos disques sont en bon état.',
          cibles: [],
        };
      }
      return {
        etat: 'corriger',
        description: `${formatListe(ko.map(nomDisque))} ${ko.length > 1 ? 'signalent' : 'signale'} un problème. Windows peut le vérifier et le réparer au prochain redémarrage.`,
        resume: ko.length > 1 ? 'des disques signalent un problème' : 'un disque signale un problème',
        cibles: ko.flatMap((d) => d.volumes.map((v) => v.letter)),
      };
    },
  },
];

type Approfondie =
  | { etat: 'jamais' }
  | { etat: 'en_cours' }
  | { etat: 'faite'; resultat: SFCResult['status'] | 'erreur' };

/** Dernière analyse, gardée tant que Kernshine est ouvert. */
const memoire: { constats: Partial<Record<ZoneId, Constat>> | null; quand: number; approfondie: Approfondie } = {
  constats: null,
  quand: 0,
  approfondie: { etat: 'jamais' },
};

const APPROFONDIE: Record<SFCResult['status'] | 'erreur', { statut: Statut; libelle: string; description: string }> = {
  healthy: { statut: 'ok', libelle: 'Tout va bien', description: 'Les fichiers indispensables à Windows sont intacts.' },
  repaired: { statut: 'ok', libelle: 'Réparés', description: 'Des fichiers abîmés ont été trouvés et réparés. Votre PC devrait fonctionner normalement.' },
  failed: { statut: 'corriger', libelle: 'À corriger', description: "Certains fichiers n'ont pas pu être réparés. Redémarrez votre PC, puis relancez la vérification." },
  unknown: { statut: 'info', libelle: 'Terminée', description: "La vérification s'est terminée sans résultat clair. Relancez-la si les problèmes continuent." },
  erreur: { statut: 'neutre', libelle: 'Non terminée', description: "La vérification n'a pas pu aller au bout. Réessayez, et acceptez la demande de Windows." },
};

export default function Repair() {
  const [phase, setPhase] = useState<Phase>(memoire.constats ? 'resultats' : 'accueil');
  const [constats, setConstats] = useState<Partial<Record<ZoneId, Constat>>>(memoire.constats ?? {});
  const [enCours, setEnCours] = useState<ZoneId | null>(null);
  const [reparations, setReparations] = useState<Partial<Record<ZoneId, string>>>({});
  const [echecs, setEchecs] = useState<Partial<Record<ZoneId, string>>>({});
  const [approfondie, setApprofondie] = useState<Approfondie>(memoire.approfondie);

  const [, setTic] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTic((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const analyseCourante = useRef(0);

  const enregistrer = (c: Partial<Record<ZoneId, Constat>>) => {
    memoire.constats = c;
    memoire.quand = Date.now();
    setConstats(c);
  };

  const analyser = async () => {
    const numero = ++analyseCourante.current;
    setPhase('analyse');
    setEchecs({});
    const trouves: Partial<Record<ZoneId, Constat>> = {};
    setConstats({});
    for (const z of ZONES) {
      if (analyseCourante.current !== numero) return;
      setEnCours(z.id);
      try {
        trouves[z.id] = await z.analyser();
      } catch (e) {
        console.warn('réparation', z.id, e);
        trouves[z.id] = ERREUR_ANALYSE;
      }
      if (analyseCourante.current !== numero) return;
      setConstats({ ...trouves });
    }
    enregistrer(trouves);
    setEnCours(null);
    setPhase('resultats');
  };

  const annuler = () => {
    analyseCourante.current++;
    setEnCours(null);
    setConstats(memoire.constats ?? {});
    setPhase(memoire.constats ? 'resultats' : 'accueil');
  };

  /** Relance l'analyse d'une seule zone (après une réparation, ou si elle n'a pas pu se faire). */
  const reanalyser = async (id: ZoneId) => {
    const zone = ZONES.find((z) => z.id === id)!;
    let c: Constat;
    try {
      c = await zone.analyser();
    } catch {
      c = ERREUR_ANALYSE;
    }
    enregistrer({ ...(memoire.constats ?? {}), [id]: c });
  };

  const reparer = async (id: ZoneId) => {
    const cibles = constats[id]?.cibles ?? [];
    if (cibles.length === 0) return;
    setReparations((r) => ({ ...r, [id]: id === 'disques' ? 'Programmation…' : 'Réparation…' }));
    setEchecs((e) => ({ ...e, [id]: undefined }));
    let ok = false;
    try {
      if (id === 'services') ok = (await invoke<RepairResult>('repair_fix_services', { names: cibles })).ok;
      if (id === 'peripheriques') ok = (await invoke<RepairResult>('repair_fix_driver_errors', { ids: cibles })).ok;
      if (id === 'fantomes') ok = (await invoke<RepairResult>('repair_fix_registry_issues', { paths: cibles })).ok;
      if (id === 'disques') ok = (await invoke<Ack>('repair_schedule_disk_check', { letters: cibles })).ok;
    } catch (e) {
      console.warn('réparation', id, e);
    }
    if (!ok) {
      setEchecs((e) => ({ ...e, [id]: "La réparation n'a pas abouti. Réessayez, et cliquez sur « Oui » quand Windows vous le demande." }));
    } else if (id === 'disques') {
      // La vérification se fait au redémarrage : l'état du disque ne change pas tout de suite.
      const c = memoire.constats?.disques;
      if (c) enregistrer({ ...memoire.constats, disques: { ...c, prevue: true } });
    } else {
      await reanalyser(id);
    }
    setReparations((r) => ({ ...r, [id]: undefined }));
  };

  const verifierFichiers = async () => {
    const enCoursEtat: Approfondie = { etat: 'en_cours' };
    memoire.approfondie = enCoursEtat;
    setApprofondie(enCoursEtat);
    let fin: Approfondie;
    try {
      const res = await invoke<SFCResult>('repair_run_sfc');
      fin = { etat: 'faite', resultat: res.status };
    } catch (e) {
      console.warn('fichiers système', e);
      fin = { etat: 'faite', resultat: 'erreur' };
    }
    memoire.approfondie = fin;
    setApprofondie(fin);
  };

  // ── Affichage ──

  const aCorriger = ZONES.filter((z) => constats[z.id]?.etat === 'corriger');
  const nonVerifiees = ZONES.filter((z) => constats[z.id]?.etat === 'erreur');
  const enBonEtat = ZONES.filter((z) => constats[z.id]?.etat === 'ok');
  const aRegler = aCorriger.filter((z) => !constats[z.id]?.prevue);

  const ligne = (z: Zone) => {
    const c = constats[z.id]!;
    let statut: Statut = 'ok';
    let libelle = 'Tout va bien';
    let action: ActionReparation | undefined;
    let description = echecs[z.id] ?? c.description;
    if (c.etat === 'erreur') {
      statut = 'neutre';
      libelle = 'Non vérifié';
      action = { libelle: 'Réessayer', variante: 'secondaire', onClick: () => reanalyser(z.id) };
    } else if (c.prevue) {
      statut = 'info';
      libelle = 'Prévue';
      description = 'La vérification se fera au prochain redémarrage du PC.';
    } else if (c.etat === 'corriger') {
      statut = 'corriger';
      libelle = 'À corriger';
      action = {
        libelle: z.id === 'fantomes' ? 'Nettoyer la liste' : z.id === 'disques' ? 'Vérifier au redémarrage' : 'Réparer',
        onClick: () => reparer(z.id),
        enCours: reparations[z.id] ?? false,
      };
    }
    return <LigneReparation key={z.id} icone={z.icone} nom={z.nom} description={description} statut={statut} libelleStatut={libelle} action={action} />;
  };

  const sfc = approfondie.etat === 'faite' ? APPROFONDIE[approfondie.resultat] : null;
  const ligneApprofondie = (
    <LigneReparation
      icone={ShieldCheckIcon}
      nom="Fichiers système de Windows"
      description={
        approfondie.etat === 'en_cours'
          ? "Vérification en cours. Comptez jusqu'à 15 minutes ; vous pouvez continuer à utiliser votre PC."
          : sfc?.description ?? "Vérifie et répare les fichiers indispensables à Windows. Comptez jusqu'à 15 minutes."
      }
      statut={sfc?.statut ?? 'neutre'}
      libelleStatut={approfondie.etat === 'en_cours' ? 'En cours' : sfc?.libelle ?? 'Jamais lancée'}
      action={{
        libelle: approfondie.etat === 'faite' ? 'Relancer la vérification' : 'Lancer la vérification',
        variante: 'secondaire',
        onClick: verifierFichiers,
        enCours: approfondie.etat === 'en_cours' && 'Vérification…',
      }}
    />
  );

  const zoneCourante = ZONES.find((z) => z.id === enCours);
  const faites = ZONES.filter((z) => constats[z.id]).slice(-2);
  const resumeFaite = (c: Constat, z: Zone) =>
    c.etat === 'ok' ? (z.id === 'fantomes' ? 'aucun trouvé' : 'tout va bien') : c.etat === 'corriger' ? 'à corriger' : 'non vérifié';

  return (
    <section className="flex flex-col gap-8">
      <EnTetePage
        titre="Réparation"
        sousTitre="Remettez Windows d'aplomb quand quelque chose ne va pas."
        actions={
          phase === 'resultats' && (
            <>
              <p className="whitespace-nowrap text-corps-petit text-secondary">Dernière vérification {depuis(memoire.quand)}</p>
              <Bouton variante="secondaire" taille="compact" onClick={analyser}>Vérifier maintenant</Bouton>
            </>
          )
        }
      />

      {phase === 'accueil' && (
        <div className="flex flex-col items-center gap-6 py-4 text-center">
          <BoutonScan libelle="Lancer l'analyse" onClick={analyser} />
          <p className="text-corps text-secondary">Cela prend environ une minute. Rien n'est réparé sans votre accord.</p>
        </div>
      )}

      {phase === 'analyse' && (
        <div className="flex flex-col items-center gap-4 py-4 text-center" aria-live="polite">
          <ProgressionCirculaire libelle="Analyse en cours">
            <MagnifyingGlassIcon className="size-12 text-action-primary-bg" />
          </ProgressionCirculaire>
          <div className="flex flex-col gap-1">
            <p className="font-titre text-titre-3 text-primary">{zoneCourante ? `Vérification : ${zoneCourante.nom}…` : 'Analyse en cours…'}</p>
            <p className="text-corps text-secondary">{zoneCourante?.pendant}</p>
          </div>
          {faites.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              {faites.map((z) => (
                <li key={z.id} className="flex items-center gap-1.5 text-corps-petit text-secondary">
                  <CheckCircleIcon className="size-4 text-status-ok-fg" />
                  {z.nom} · {resumeFaite(constats[z.id]!, z)}
                </li>
              ))}
            </ul>
          )}
          <Bouton variante="secondaire" taille="compact" onClick={annuler}>Annuler</Bouton>
        </div>
      )}

      {phase === 'resultats' && (
        <>
          <Carte className="flex items-center gap-6 px-8">
            <div className={`grid size-[72px] shrink-0 place-items-center rounded-full ${aRegler.length > 0 ? 'bg-status-danger-bg' : 'bg-status-ok-bg'}`}>
              {aRegler.length > 0 ? <WarningIcon className="size-10 text-status-danger-fg" /> : <CheckCircleIcon className="size-10 text-status-ok-fg" />}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="text-titre-1 text-primary">
                {aRegler.length > 0 ? `${aRegler.length} ${pluriel(aRegler.length, 'réparation conseillée', 'réparations conseillées')}` : 'Windows fonctionne bien'}
              </h2>
              <p className="text-corps text-secondary">
                {aRegler.length > 0
                  ? `${formatListe(aRegler.map((z) => constats[z.id]!.resume!)).replace(/^./, (c) => c.toUpperCase())}. Rien n'est réparé sans votre accord.`
                  : 'Aucune réparation nécessaire pour le moment.'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1.5">
              <p className="text-legende text-secondary">Windows</p>
              <Pastille statut={aRegler.length > 0 ? 'corriger' : 'ok'} />
            </div>
          </Carte>

          {aCorriger.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-titre-3 text-primary">À corriger</h2>
              <ul className="flex flex-col gap-3">{aCorriger.map(ligne)}</ul>
              <p className="text-corps-petit text-secondary">Windows va vous demander l'autorisation avant chaque réparation.</p>
            </section>
          )}

          {nonVerifiees.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-titre-3 text-primary">Non vérifié</h2>
              <ul className="flex flex-col gap-3">{nonVerifiees.map(ligne)}</ul>
            </section>
          )}

          {enBonEtat.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-titre-3 text-primary">Tout va bien</h2>
              <ul className="flex flex-col gap-3">{enBonEtat.map(ligne)}</ul>
            </section>
          )}

          <section className="flex flex-col gap-4">
            <h2 className="text-titre-3 text-primary">Vérification approfondie</h2>
            <ul className="flex flex-col gap-3">{ligneApprofondie}</ul>
            <p className="text-corps-petit text-secondary">
              À lancer si Windows plante ou se comporte bizarrement. Vous pouvez continuer à utiliser votre PC pendant ce temps.
            </p>
          </section>
        </>
      )}
    </section>
  );
}
