import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircleIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Channel, invoke } from '@tauri-apps/api/core';
import type { CloseAppResult, ElevatedInstallResult, SoftwareScanResult, SoftwareUpdate, StreamResult, SwProgress } from '../../types/commands';
import { depuis, formatListe, pluriel } from '../../lib/format';
import Bandeau from '../ui/Bandeau';
import Bouton from '../ui/Bouton';
import BoutonScan from '../ui/BoutonScan';
import Carte from '../ui/Carte';
import ProgressionCirculaire from '../ui/ProgressionCirculaire';
import BilanMisesAJour from './BilanMisesAJour';
import InstallationEnCours, { type StatutInstallation } from './InstallationEnCours';
import LigneMiseAJour, { type Fermeture } from './LigneMiseAJour';
import { derniereRecherche } from './memoire';

type Phase = 'accueil' | 'recherche' | 'liste' | 'installation' | 'termine';

const parNom = (a: SoftwareUpdate, b: SoftwareUpdate) => a.name.localeCompare(b.name);
/** Cochées d'office : version lisible et application fermée. */
const cocheeDOffice = (p: SoftwareUpdate) => !p.versionUnknown && !p.open;
const paquet = (p: SoftwareUpdate) => ({ id: p.id, name: p.name, currentVersion: p.currentVersion, availableVersion: p.availableVersion });

/** Onglet « Mises à jour » de la page Applications. */
export default function MisesAJour() {
  const navigate = useNavigate();
  const memo = derniereRecherche.resultat;
  const [phase, setPhase] = useState<Phase>(memo ? 'liste' : 'accueil');
  const [liste, setListe] = useState<SoftwareUpdate[]>(memo?.data ?? []);
  const [masques, setMasques] = useState<SoftwareUpdate[]>(memo?.hidden ?? []);
  const [erreur, setErreur] = useState<string | null>(memo && !memo.ok ? (memo.error ?? null) : null);
  const [selection, setSelection] = useState<Set<string>>(new Set((memo?.data ?? []).filter(cocheeDOffice).map((p) => p.id)));
  const [fermetures, setFermetures] = useState<Map<string, Fermeture>>(new Map());
  const [erreurMasque, setErreurMasque] = useState<string | null>(null);

  const [installes, setInstalles] = useState<SoftwareUpdate[]>([]);
  const [statuts, setStatuts] = useState<Map<string, StatutInstallation>>(new Map());
  const [arretDemande, setArretDemande] = useState(false);
  const [logFile, setLogFile] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<Set<string>>(new Set());

  // Rafraîchit « Dernière vérification il y a… » chaque minute.
  const [, setTic] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTic((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const recherche = useRef(0);

  const rechercher = async () => {
    const numero = ++recherche.current;
    setPhase('recherche');
    setErreur(null);
    setErreurMasque(null);
    setFermetures(new Map());
    try {
      const res = await invoke<SoftwareScanResult>('updates_get_software');
      if (recherche.current !== numero) return;
      derniereRecherche.resultat = res;
      derniereRecherche.quand = Date.now();
      setListe(res.data);
      setMasques(res.hidden ?? []);
      setSelection(new Set(res.data.filter(cocheeDOffice).map((p) => p.id)));
      setErreur(res.ok ? null : (res.error ?? 'La recherche a échoué. Réessayez dans un instant.'));
    } catch (e) {
      console.warn('recherche des mises à jour', e);
      if (recherche.current !== numero) return;
      setErreur('La recherche a échoué. Réessayez dans un instant.');
    }
    setPhase('liste');
  };

  const annulerRecherche = () => {
    recherche.current++;
    setPhase(derniereRecherche.resultat ? 'liste' : 'accueil');
  };

  // La liste gardée en mémoire suit les changements (masqués, fermetures).
  const memoriser = (data: SoftwareUpdate[], hidden: SoftwareUpdate[]) => {
    if (derniereRecherche.resultat) derniereRecherche.resultat = { ...derniereRecherche.resultat, data, hidden };
  };

  const cocher = (id: string, coche: boolean) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (coche) next.add(id);
      else next.delete(id);
      return next;
    });

  const masquer = async (p: SoftwareUpdate) => {
    try {
      await invoke<string[]>('updates_hide', { id: p.id });
    } catch {
      setErreurMasque("Impossible de masquer cette application. Réessayez.");
      return;
    }
    setErreurMasque(null);
    const data = liste.filter((x) => x.id !== p.id);
    const hidden = [...masques, p].sort(parNom);
    setListe(data);
    setMasques(hidden);
    cocher(p.id, false);
    memoriser(data, hidden);
  };

  const toutProposer = async () => {
    try {
      await invoke<string[]>('updates_unhide_all');
    } catch {
      setErreurMasque('Impossible de proposer ces applications à nouveau. Réessayez.');
      return;
    }
    setErreurMasque(null);
    const data = [...liste, ...masques].sort(parNom);
    setSelection((prev) => new Set([...prev, ...masques.filter(cocheeDOffice).map((p) => p.id)]));
    setListe(data);
    setMasques([]);
    memoriser(data, []);
  };

  /** Ferme l'application d'un programme ; renvoie vrai si elle est fermée. */
  const fermerApplication = async (p: SoftwareUpdate, forcer: boolean): Promise<CloseAppResult | null> => {
    try {
      return await invoke<CloseAppResult>('updates_close_related_app', { pkg: { name: p.name }, force: forcer });
    } catch (e) {
      console.warn('fermeture', e);
      return null;
    }
  };

  const fermerDansLaListe = async (p: SoftwareUpdate, forcer: boolean) => {
    setFermetures((prev) => new Map(prev).set(p.id, { etat: 'en_cours' }));
    const res = await fermerApplication(p, forcer);
    if (res?.ok) {
      setFermetures((prev) => {
        const next = new Map(prev);
        next.delete(p.id);
        return next;
      });
      const data = liste.map((x) => (x.id === p.id ? { ...x, open: false } : x));
      setListe(data);
      memoriser(data, masques);
      if (!p.versionUnknown) cocher(p.id, true);
    } else {
      setFermetures((prev) => new Map(prev).set(p.id, { etat: res?.reason === 'still_open' ? 'encore_ouverte' : 'introuvable' }));
    }
  };

  const installer = async () => {
    const choisis = liste.filter((p) => selection.has(p.id));
    if (choisis.length === 0) return;
    setInstalles(choisis);
    setStatuts(new Map());
    setArretDemande(false);
    setLogFile(null);
    setEnCours(new Set());
    setPhase('installation');

    const canal = new Channel<SwProgress>();
    canal.onmessage = ({ id, ...s }) => setStatuts((prev) => new Map(prev).set(id, s));
    try {
      const res = await invoke<StreamResult>('updates_install_software_stream', { packages: choisis.map(paquet), onProgress: canal });
      setLogFile(res?.logFile ?? null);
    } catch (e) {
      console.warn('installation', e);
    }
    // Les applications installées ne sont plus « à mettre à jour » : la prochaine visite relancera la recherche.
    derniereRecherche.resultat = null;
    setPhase('termine');
  };

  const arreter = () => {
    setArretDemande(true);
    invoke('updates_stop').catch(() => {});
  };

  const occupe = (id: string, oui: boolean) =>
    setEnCours((prev) => {
      const next = new Set(prev);
      if (oui) next.add(id);
      else next.delete(id);
      return next;
    });

  const reessayer = async (p: SoftwareUpdate) => {
    occupe(p.id, true);
    try {
      const r = await invoke<ElevatedInstallResult>('updates_install_elevated', { pkg: paquet(p) });
      if (r.logFile && !r.ok) setLogFile(r.logFile);
      setStatuts((prev) => new Map(prev).set(p.id, { status: r.ok ? 'ok' : 'error', reason: r.reason, kind: r.kind, reboot: r.reboot, verification: r.verification }));
    } catch (e) {
      console.warn('nouvel essai', e);
    }
    occupe(p.id, false);
  };

  const fermerDansLeBilan = async (p: SoftwareUpdate) => {
    occupe(p.id, true);
    const res = await fermerApplication(p, false);
    const closeMsg = res?.ok
      ? `${p.name} est fermé : vérifiez à nouveau pour le mettre à jour.`
      : res?.reason === 'still_open'
        ? `${p.name} est encore ouvert, sans doute près de l'horloge : quittez-le depuis son icône, puis vérifiez à nouveau.`
        : `Kernshine n'a pas trouvé la fenêtre de ${p.name} : fermez-le vous-même, puis vérifiez à nouveau.`;
    setStatuts((prev) => {
      const cur = prev.get(p.id);
      return cur ? new Map(prev).set(p.id, { ...cur, closeMsg }) : prev;
    });
    occupe(p.id, false);
  };

  // ── Affichage ──

  if (phase === 'accueil') {
    return (
      <div className="flex flex-col items-center gap-6 py-4 text-center">
        <BoutonScan libelle="Lancer la recherche" onClick={rechercher} />
        <p className="text-corps text-secondary">Kernshine regarde quelles applications ont une nouvelle version. Rien n'est installé sans votre accord.</p>
      </div>
    );
  }

  if (phase === 'recherche') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center" aria-live="polite">
        <ProgressionCirculaire libelle="Recherche des mises à jour">
          <MagnifyingGlassIcon className="size-12 text-action-primary-bg" />
        </ProgressionCirculaire>
        <div className="flex flex-col gap-1">
          <p className="font-titre text-titre-3 text-primary">Recherche des mises à jour…</p>
          <p className="text-corps text-secondary">Kernshine compare vos applications avec leurs dernières versions. Cela prend quelques secondes.</p>
        </div>
        <Bouton variante="secondaire" taille="compact" onClick={annulerRecherche}>Annuler</Bouton>
      </div>
    );
  }

  if (phase === 'installation') {
    return <InstallationEnCours paquets={installes} statuts={statuts} arretDemande={arretDemande} onArreter={arreter} />;
  }

  if (phase === 'termine') {
    return (
      <BilanMisesAJour
        paquets={installes}
        statuts={statuts}
        ouvertesNonFaites={liste.filter((p) => p.open && !selection.has(p.id))}
        enCours={enCours}
        logFile={logFile}
        onReessayer={reessayer}
        onFermer={fermerDansLeBilan}
        onOuvrirRapport={() => invoke('shell_open_log', { path: logFile }).catch(() => {})}
        onVerifier={rechercher}
        onAccueil={() => navigate('/')}
      />
    );
  }

  // phase === 'liste'
  const derniere = `Dernière vérification ${depuis(derniereRecherche.quand)}`;
  const ouvertes = liste.filter((p) => p.open);
  const connues = liste.filter((p) => !p.versionUnknown);
  const inconnues = liste.filter((p) => p.versionUnknown);
  const choisies = liste.filter((p) => selection.has(p.id)).length;

  const ligneMasques = masques.length > 0 && (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-corps-petit text-secondary">
        {masques.length} {pluriel(masques.length, 'application ne vous est plus proposée', 'applications ne vous sont plus proposées')}.
      </p>
      <Bouton variante="secondaire" taille="compact" onClick={toutProposer}>
        {masques.length > 1 ? 'Les proposer à nouveau' : 'La proposer à nouveau'}
      </Bouton>
    </div>
  );

  const ligne = (p: SoftwareUpdate) => (
    <LigneMiseAJour
      key={p.id}
      pkg={p}
      coche={selection.has(p.id)}
      onCocher={(c) => cocher(p.id, c)}
      onMasquer={() => masquer(p)}
      fermeture={fermetures.get(p.id)}
      onFermer={(forcer) => fermerDansLaListe(p, forcer)}
    />
  );

  if (erreur) {
    return (
      <div className="flex flex-col gap-4">
        <Bandeau type="corriger" action={{ libelle: 'Réessayer', onClick: rechercher }}>{erreur}</Bandeau>
      </div>
    );
  }

  if (liste.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <Carte className="flex items-center gap-6 px-8">
          <div className="grid size-[72px] shrink-0 place-items-center rounded-full bg-status-ok-bg">
            <CheckCircleIcon className="size-10 text-status-ok-fg" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-titre-1 text-primary">Tout est à jour</h2>
            <p className="text-corps text-secondary">Toutes vos applications sont à la dernière version. {derniere}.</p>
          </div>
        </Carte>
        {ligneMasques}
        {erreurMasque && <Bandeau type="corriger">{erreurMasque}</Bandeau>}
        <div className="flex justify-end">
          <Bouton variante="secondaire" onClick={rechercher}>Vérifier à nouveau</Bouton>
        </div>
      </div>
    );
  }

  return (
    <>
      <Carte className="flex items-center gap-6 px-8">
        <p className="font-titre text-chiffre-grand text-primary">{liste.length}</p>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-corps-gras text-primary">
            {liste.length > 1 ? 'applications ne sont pas à jour' : "application n'est pas à jour"}
          </p>
          <p className="text-corps-petit text-secondary">
            {liste.length > 1 ? 'Elles sont installées une par une. ' : ''}Décochez ce que vous ne voulez pas mettre à jour.
          </p>
        </div>
      </Carte>

      {ouvertes.length > 0 && (
        <Bandeau type="info">
          {ouvertes.length > 1
            ? `${formatListe(ouvertes.map((p) => p.name))} sont ouvertes : elles sont décochées pour ne rien perdre. Fermez-les pour les mettre à jour.`
            : `${ouvertes[0].name} est ouverte : elle est décochée pour ne rien perdre. Fermez-la pour la mettre à jour.`}
        </Bandeau>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-corps-petit text-secondary">{derniere}</p>
        <Bouton variante="secondaire" taille="compact" onClick={rechercher}>Vérifier maintenant</Bouton>
      </div>

      <ul className="flex flex-col gap-3">{connues.map(ligne)}</ul>

      {inconnues.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-titre-3 text-primary">Version actuelle inconnue</h2>
            <p className="text-corps-petit text-secondary">
              Windows ne sait pas quelle version est installée : ces applications peuvent revenir dans la liste même
              après leur mise à jour. Elles ne sont pas cochées d'office.
            </p>
          </div>
          <ul className="flex flex-col gap-3">{inconnues.map(ligne)}</ul>
        </section>
      )}

      {ligneMasques}
      {erreurMasque && <Bandeau type="corriger">{erreurMasque}</Bandeau>}

      {/* Barre de sélection, collée au bas de la zone de contenu */}
      <div className="sticky bottom-0 -mx-12 -mb-12 mt-auto flex min-h-[88px] items-center gap-4 border-t bg-surface px-12 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-corps-gras text-primary">
            {choisies > 0 ? `${choisies} ${pluriel(choisies, 'application sélectionnée', 'applications sélectionnées')}` : 'Rien de sélectionné'}
          </p>
          <p className="text-corps-petit text-secondary">{choisies > 1 ? 'Elles seront installées une par une.' : 'Rien ne change sans votre clic.'}</p>
        </div>
        <Bouton onClick={installer} disabled={choisies === 0}>Mettre à jour</Bouton>
      </div>
    </>
  );
}
