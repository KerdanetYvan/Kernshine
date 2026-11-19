import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowCounterClockwiseIcon, CheckCircleIcon, MagnifyingGlassIcon, ShieldWarningIcon } from '@phosphor-icons/react';
import { Channel, invoke } from '@tauri-apps/api/core';
import type { Driver, DriverInstallResult, DriverProgress, DriverScan } from '../types/commands';
import { depuis, formatOctets, pluriel } from '../lib/format';
import Bandeau from '../components/ui/Bandeau';
import Bouton from '../components/ui/Bouton';
import BoutonScan from '../components/ui/BoutonScan';
import Carte from '../components/ui/Carte';
import EnTetePage from '../components/ui/EnTetePage';
import FenetreConfirmation from '../components/ui/FenetreConfirmation';
import Pastille from '../components/ui/Pastille';
import ProgressionCirculaire from '../components/ui/ProgressionCirculaire';
import { usePrefs } from '../hooks/usePrefs';
import BilanPilotes from '../components/pilotes/BilanPilotes';
import InstallationPilotes, { type EtatEtape } from '../components/pilotes/InstallationPilotes';
import LignePilote from '../components/pilotes/LignePilote';

type Phase = 'accueil' | 'recherche' | 'liste' | 'installation' | 'termine';

/** Dernière recherche, gardée tant que Kernshine est ouvert (comme pour les applications). */
const memoire: { resultat: DriverScan | null; quand: number } = { resultat: null, quand: 0 };

export default function Drivers() {
  const navigate = useNavigate();
  const { prefs } = usePrefs();
  const memo = memoire.resultat;
  const [phase, setPhase] = useState<Phase>(memo ? 'liste' : 'accueil');
  const [pilotes, setPilotes] = useState<Driver[]>(memo?.data ?? []);
  const [masques, setMasques] = useState(memo?.hiddenCount ?? 0);
  const [erreur, setErreur] = useState<string | null>(memo && !memo.ok ? (memo.error ?? null) : null);
  const [selection, setSelection] = useState<Set<string>>(new Set((memo?.data ?? []).map((p) => p.id)));
  const [avertissement, setAvertissement] = useState<string | null>(null);

  const [installes, setInstalles] = useState<Driver[]>([]);
  const [sauvegarde, setSauvegarde] = useState<EtatEtape>('attente');
  const [etats, setEtats] = useState<Map<string, EtatEtape>>(new Map());
  const [aRedemarrer, setARedemarrer] = useState<Driver[]>([]);
  const [debute, setDebute] = useState(false);
  const [arretDemande, setArretDemande] = useState(false);
  const [pointDeRestauration, setPointDeRestauration] = useState(false);
  const [sansRestauration, setSansRestauration] = useState(false);
  const [confirmerRedemarrage, setConfirmerRedemarrage] = useState(false);

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
    setAvertissement(null);
    try {
      const res = await invoke<DriverScan>('drivers_get');
      if (recherche.current !== numero) return;
      memoire.resultat = res;
      memoire.quand = Date.now();
      setPilotes(res.data);
      setMasques(res.hiddenCount);
      setSelection(new Set(res.data.map((p) => p.id)));
      setErreur(res.ok ? null : (res.error ?? 'La recherche a échoué. Réessayez dans un instant.'));
    } catch (e) {
      console.warn('pilotes', e);
      if (recherche.current !== numero) return;
      setErreur('La recherche a échoué. Réessayez dans un instant.');
    }
    setPhase('liste');
  };

  const annulerRecherche = () => {
    recherche.current++;
    setPhase(memoire.resultat ? 'liste' : 'accueil');
  };

  const cocher = (id: string, coche: boolean) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (coche) next.add(id);
      else next.delete(id);
      return next;
    });

  const masquer = async (p: Driver) => {
    try {
      await invoke<string[]>('drivers_hide', { key: p.key });
    } catch {
      setAvertissement('Impossible de masquer ce pilote. Réessayez.');
      return;
    }
    const data = pilotes.filter((x) => x.id !== p.id);
    setPilotes(data);
    setMasques((n) => n + 1);
    cocher(p.id, false);
    if (memoire.resultat) memoire.resultat = { ...memoire.resultat, data, hiddenCount: memoire.resultat.hiddenCount + 1 };
  };

  const toutProposer = async () => {
    try {
      await invoke<string[]>('drivers_unhide_all');
    } catch {
      setAvertissement('Impossible de proposer ces pilotes à nouveau. Réessayez.');
      return;
    }
    // Les pilotes masqués ne sont pas dans la liste : une nouvelle recherche les ramène.
    rechercher();
  };

  const installer = async (exigerRestauration: boolean) => {
    const choisis = pilotes.filter((p) => selection.has(p.id));
    if (choisis.length === 0) return;
    setSansRestauration(false);
    setInstalles(choisis);
    setSauvegarde('attente');
    setEtats(new Map());
    setARedemarrer([]);
    setDebute(false);
    setArretDemande(false);
    setAvertissement(null);
    setPhase('installation');

    const parId = new Map(choisis.map((p) => [p.id, p]));
    const etat = (id: string, e: EtatEtape) => setEtats((prev) => new Map(prev).set(id, e));
    const canal = new Channel<DriverProgress>();
    canal.onmessage = (a) => {
      setDebute(true);
      if (a.etape === 'sauvegarde') setSauvegarde('en_cours');
      else if (a.etape === 'sauvegardeFaite') setSauvegarde(a.ok ? 'ok' : 'echec');
      else if (a.etape === 'debut') etat(a.id, 'en_cours');
      else if (a.etape === 'fin') {
        etat(a.id, a.ok ? 'ok' : 'echec');
        const p = parId.get(a.id);
        if (a.ok && a.restart && p) setARedemarrer((prev) => [...prev, p]);
      } else if (a.etape === 'saute') etat(a.id, 'arrete');
      else etat(a.id, 'echec');
    };

    let res: DriverInstallResult | null = null;
    try {
      res = await invoke<DriverInstallResult>('drivers_install', {
        ids: choisis.map((p) => p.id),
        restore: prefs.restoreBeforeDrivers,
        requireRestore: exigerRestauration,
        onProgress: canal,
      });
    } catch (e) {
      console.warn('pilotes', e);
    }

    if (res?.status === 'restore_failed') {
      setPhase('liste');
      setSansRestauration(true);
      return;
    }
    if (!res || res.status === 'refused' || res.status === 'error') {
      setPhase('liste');
      setAvertissement(
        res?.status === 'refused'
          ? "L'installation n'a pas commencé : Windows a besoin de votre autorisation. Réessayez et cliquez sur « Oui »."
          : "L'installation n'a pas pu se lancer. Réessayez dans un instant.",
      );
      return;
    }
    setPointDeRestauration(res.restorePoint);
    // Les pilotes installés ne sont plus « à mettre à jour » : la prochaine visite relancera la recherche.
    memoire.resultat = null;
    setPhase('termine');
  };

  const arreter = () => {
    setArretDemande(true);
    invoke('drivers_stop').catch(() => {});
  };

  const redemarrer = () => {
    setConfirmerRedemarrage(false);
    invoke<boolean>('system_restart')
      .then((ok) => { if (!ok) setAvertissement("Le redémarrage n'a pas pu être lancé. Redémarrez depuis le menu Démarrer."); })
      .catch(() => setAvertissement("Le redémarrage n'a pas pu être lancé. Redémarrez depuis le menu Démarrer."));
  };

  // ── Affichage ──

  const choisis = pilotes.filter((p) => selection.has(p.id));
  const aRedemarrerListe = pilotes.filter((p) => p.needsRestart).length;
  const derniere = `Dernière vérification ${depuis(memoire.quand)}`;

  const ligneMasques = masques > 0 && (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-corps-petit text-secondary">
        {masques} {pluriel(masques, 'pilote ne vous est plus proposé', 'pilotes ne vous sont plus proposés')}.
      </p>
      <Bouton variante="secondaire" taille="compact" onClick={toutProposer}>
        {masques > 1 ? 'Les proposer à nouveau' : 'Le proposer à nouveau'}
      </Bouton>
    </div>
  );

  return (
    <section className="flex min-h-full flex-col gap-8">
      <EnTetePage titre="Pilotes" sousTitre="Gardez les composants de votre PC à jour pour un PC plus stable." />

      {phase === 'accueil' && (
        <div className="flex flex-col items-center gap-6 py-4 text-center">
          <BoutonScan libelle="Lancer la recherche" onClick={rechercher} />
          <p className="text-corps text-secondary">Kernshine demande à Windows les nouveaux pilotes de votre PC. Rien n'est installé sans votre accord.</p>
        </div>
      )}

      {phase === 'recherche' && (
        <div className="flex flex-col items-center gap-4 py-4 text-center" aria-live="polite">
          <ProgressionCirculaire libelle="Recherche des pilotes">
            <MagnifyingGlassIcon className="size-12 text-action-primary-bg" />
          </ProgressionCirculaire>
          <div className="flex flex-col gap-1">
            <p className="font-titre text-titre-3 text-primary">Recherche des pilotes…</p>
            <p className="text-corps text-secondary">Windows cherche les pilotes adaptés à vos composants. Cela peut prendre une minute.</p>
          </div>
          <Bouton variante="secondaire" taille="compact" onClick={annulerRecherche}>Annuler</Bouton>
        </div>
      )}

      {phase === 'installation' && (
        <InstallationPilotes
          pilotes={installes}
          sauvegarde={sauvegarde}
          etats={etats}
          enAttenteAutorisation={!debute}
          avecSauvegarde={prefs.restoreBeforeDrivers}
          arretDemande={arretDemande}
          onArreter={arreter}
        />
      )}

      {phase === 'termine' && (
        <BilanPilotes
          pilotes={installes}
          etats={etats}
          aRedemarrer={aRedemarrer}
          pointDeRestauration={pointDeRestauration}
          restaurationDesactivee={!prefs.restoreBeforeDrivers}
          onRedemarrer={() => setConfirmerRedemarrage(true)}
          onVerifier={rechercher}
          onAccueil={() => navigate('/')}
        />
      )}

      {phase === 'liste' && erreur && (
        <Bandeau type="corriger" action={{ libelle: 'Réessayer', onClick: rechercher }}>{erreur}</Bandeau>
      )}

      {phase === 'liste' && !erreur && pilotes.length === 0 && (
        <>
          <Carte className="flex items-center gap-6 px-8">
            <div className="grid size-[72px] shrink-0 place-items-center rounded-full bg-status-ok-bg">
              <CheckCircleIcon className="size-10 text-status-ok-fg" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="text-titre-1 text-primary">Tout est à jour</h2>
              <p className="text-corps text-secondary">Tous les pilotes de votre PC sont à la dernière version. {derniere}.</p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1.5">
              <p className="text-legende text-secondary">État des pilotes</p>
              <Pastille statut="ok" />
            </div>
          </Carte>
          {ligneMasques}
          {avertissement && <Bandeau type="surveiller">{avertissement}</Bandeau>}
          <div className="flex justify-end">
            <Bouton variante="secondaire" onClick={rechercher}>Vérifier à nouveau</Bouton>
          </div>
        </>
      )}

      {phase === 'liste' && !erreur && pilotes.length > 0 && (
        <>
          <Carte className="flex items-center gap-6 px-8">
            <p className="font-titre text-chiffre-grand text-primary">{pilotes.length}</p>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-corps-gras text-primary">
                {pilotes.length > 1 ? 'pilotes ne sont pas à jour' : "pilote n'est pas à jour"}
                {aRedemarrerListe > 0 && `, dont ${aRedemarrerListe} ${pluriel(aRedemarrerListe, 'demande', 'demandent')} un redémarrage`}
              </p>
              <p className="text-corps-petit text-secondary">Des pilotes à jour rendent le PC plus stable : écran, son, Wi-Fi, jeux.</p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1.5">
              <p className="text-legende text-secondary">État des pilotes</p>
              <Pastille statut="surveiller" />
            </div>
          </Carte>

          <Bandeau type="info">
            {prefs.restoreBeforeDrivers
              ? "Un point de restauration est créé avant l'installation : vous pourrez revenir en arrière en cas de problème."
              : "Aucun point de restauration ne sera créé : ce réglage est désactivé dans les Paramètres."}
          </Bandeau>
          {avertissement && <Bandeau type="surveiller">{avertissement}</Bandeau>}

          <div className="flex items-center justify-between gap-4">
            <p className="text-corps-petit text-secondary">{derniere}</p>
            <Bouton variante="secondaire" taille="compact" onClick={rechercher}>Vérifier maintenant</Bouton>
          </div>

          <ul className="flex flex-col gap-3">
            {pilotes.map((p) => (
              <LignePilote key={p.id} pilote={p} coche={selection.has(p.id)} onCocher={(c) => cocher(p.id, c)} onMasquer={() => masquer(p)} />
            ))}
          </ul>

          {ligneMasques}

          <div className="sticky bottom-0 -mx-12 -mb-12 mt-auto flex min-h-[88px] items-center gap-4 border-t bg-surface px-12 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-corps-gras text-primary">
                {choisis.length > 0 ? `${choisis.length} ${pluriel(choisis.length, 'pilote sélectionné', 'pilotes sélectionnés')}` : 'Rien de sélectionné'}
              </p>
              <p className="text-corps-petit text-secondary">
                {choisis.length > 0 ? `Environ ${formatOctets(choisis.reduce((s, p) => s + p.sizeBytes, 0))} à télécharger` : "Cochez les pilotes à installer."}
              </p>
            </div>
            <Bouton onClick={() => installer(true)} disabled={choisis.length === 0}>Mettre à jour</Bouton>
          </div>
        </>
      )}

      {sansRestauration && (
        <FenetreConfirmation
          icone={ShieldWarningIcon}
          titre="Installer sans point de restauration ?"
          texte="Windows n'a pas pu créer de point de restauration : la protection du système est peut-être désactivée sur ce PC. Sans lui, revenir en arrière après un problème sera plus difficile. Rien n'a été installé."
          danger
          definitif={false}
          libelleConfirmer="Installer quand même"
          onConfirmer={() => installer(false)}
          onAnnuler={() => setSansRestauration(false)}
        />
      )}

      {confirmerRedemarrage && (
        <FenetreConfirmation
          icone={ArrowCounterClockwiseIcon}
          titre="Redémarrer maintenant ?"
          texte="Enregistrez d'abord vos documents ouverts : le PC redémarre tout de suite, et ce qui n'est pas enregistré sera perdu."
          libelleConfirmer="Redémarrer"
          onConfirmer={redemarrer}
          onAnnuler={() => setConfirmerRedemarrage(false)}
        />
      )}
    </section>
  );
}
