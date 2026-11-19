import { useEffect, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, PackageIcon, SquaresFourIcon } from '@phosphor-icons/react';
import { Channel, invoke } from '@tauri-apps/api/core';
import type { DiskSpace, InstalledProgram, UninstallProgress, UninstallResult } from '../../types/commands';
import { formatOctets, pluriel } from '../../lib/format';
import Bandeau from '../ui/Bandeau';
import Bouton from '../ui/Bouton';
import FenetreConfirmation from '../ui/FenetreConfirmation';
import BilanDesinstallation from './BilanDesinstallation';
import DesinstallationEnCours from './DesinstallationEnCours';
import LigneProgramme from './LigneProgramme';
import { avecTaille, chargerProgrammes, memoireProgrammes, normaliser, trier, type Tri } from './programmes';

type Phase = 'chargement' | 'erreur' | 'liste' | 'desinstallation' | 'termine';

const disques = () => invoke<DiskSpace[]>('system_get_disks').catch(() => [] as DiskSpace[]);

/**
 * Onglet « Désinstallation » de la page Applications. La liste se lit en un instant (pas
 * d'analyse à lancer) ; les tailles que Windows ne connaît pas sont mesurées ensuite.
 * Chaque programme est retiré avec son propre outil, que l'utilisateur suit.
 */
export default function Desinstallation() {
  const navigate = useNavigate();
  const [, rafraichir] = useReducer((n: number) => n + 1, 0);
  const [phase, setPhase] = useState<Phase>(memoireProgrammes.liste ? 'liste' : 'chargement');
  const [lecture, setLecture] = useState(0);
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState<Tri>('taille');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [confirmer, setConfirmer] = useState(false);
  const [aRetirer, setARetirer] = useState<InstalledProgram[]>([]);
  const [statuts, setStatuts] = useState<Map<string, UninstallProgress['status']>>(new Map());
  const [arretDemande, setArretDemande] = useState(false);
  const [resultats, setResultats] = useState<UninstallResult[]>([]);
  const [disquesAvant, setDisquesAvant] = useState<DiskSpace[]>([]);
  const [disquesApres, setDisquesApres] = useState<DiskSpace[]>([]);

  // Les tailles mesurées arrivent au fil de l'eau, même pendant une autre phase.
  useEffect(() => {
    memoireProgrammes.abonnes.add(rafraichir);
    return () => {
      memoireProgrammes.abonnes.delete(rafraichir);
    };
  }, []);

  const charger = () => {
    setPhase('chargement');
    chargerProgrammes()
      .then(() => {
        setSelection(new Set());
        setLecture((n) => n + 1);
        setPhase('liste');
      })
      .catch((e) => {
        console.warn('programmes', e);
        setPhase('erreur');
      });
  };

  useEffect(() => {
    if (!memoireProgrammes.liste) charger();
  }, []);

  const liste = memoireProgrammes.liste;
  const programmes = (liste?.programs ?? []).map(avecTaille);
  const mesureEnCours = memoireProgrammes.mesureEnCours;

  // L'ordre ne bouge pas pendant la mesure (pas de ligne qui saute sous la souris) :
  // il est recalculé à chaque lecture, changement de tri et à la fin de la mesure.
  const cle = `${lecture}|${tri}|${mesureEnCours}`;
  const [ordre, setOrdre] = useState<{ cle: string; ids: string[] }>({ cle: '', ids: [] });
  if (ordre.cle !== cle) setOrdre({ cle, ids: trier(programmes, tri).map((p) => p.id) });

  const parId = new Map(programmes.map((p) => [p.id, p]));
  const filtre = normaliser(recherche.trim());
  const visibles = ordre.ids
    .map((id) => parId.get(id))
    .filter((p): p is InstalledProgram => p !== undefined)
    .filter((p) => !filtre || normaliser(`${p.name} ${p.publisher ?? ''}`).includes(filtre));

  const choisis = programmes.filter((p) => selection.has(p.id));
  const totalChoisi = choisis.reduce((s, p) => s + (p.sizeBytes ?? 0), 0);
  const tailleInconnue = choisis.some((p) => p.sizeBytes === null);

  const cocher = (id: string, coche: boolean) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (coche) next.add(id);
      else next.delete(id);
      return next;
    });

  const desinstaller = async (cibles: InstalledProgram[]) => {
    setConfirmer(false);
    setARetirer(cibles);
    setStatuts(new Map());
    setArretDemande(false);
    setPhase('desinstallation');
    setDisquesAvant(await disques());
    const canal = new Channel<UninstallProgress>();
    canal.onmessage = (p) => setStatuts((prev) => new Map(prev).set(p.id, p.status));
    let res: UninstallResult[];
    try {
      res = await invoke<UninstallResult[]>('uninstall_run', { ids: cibles.map((p) => p.id), onProgress: canal });
    } catch (e) {
      console.warn('désinstallation', e);
      res = cibles.map((p) => ({ id: p.id, status: 'error' }));
    }
    setResultats(res);
    setDisquesApres(await disques());
    // Les programmes retirés quittent la liste gardée en mémoire.
    const partis = new Set(res.filter((r) => r.status === 'removed' || r.status === 'missing').map((r) => r.id));
    if (memoireProgrammes.liste) {
      memoireProgrammes.liste = { ...memoireProgrammes.liste, programs: memoireProgrammes.liste.programs.filter((p) => !partis.has(p.id)) };
    }
    setSelection(new Set());
    setPhase('termine');
  };

  const arreter = () => {
    setArretDemande(true);
    invoke('uninstall_stop').catch(() => {});
  };

  // ── Affichage ──

  if (phase === 'chargement') {
    return <p className="py-4 text-center text-corps text-secondary" aria-live="polite">Lecture des programmes installés…</p>;
  }

  if (phase === 'erreur') {
    return (
      <Bandeau type="corriger" action={{ libelle: 'Réessayer', onClick: charger }}>
        La liste des programmes n'a pas pu être lue. Réessayez dans un instant.
      </Bandeau>
    );
  }

  if (phase === 'desinstallation') {
    return <DesinstallationEnCours programmes={aRetirer} statuts={statuts} arretDemande={arretDemande} onArreter={arreter} />;
  }

  if (phase === 'termine') {
    return (
      <BilanDesinstallation
        programmes={aRetirer}
        resultats={resultats}
        disquesAvant={disquesAvant}
        disquesApres={disquesApres}
        onReessayer={desinstaller}
        onGrosFichiers={() => navigate('/cleaning?onglet=gros-fichiers')}
        onVoirProgrammes={charger}
        onAccueil={() => navigate('/')}
      />
    );
  }

  // phase === 'liste'
  return (
    <>
      <Bandeau type="info">
        Chaque programme se désinstalle avec son propre outil : si une fenêtre s'ouvre, suivez-la. Vos documents ne sont pas touchés.
      </Bandeau>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex w-full max-w-[360px] items-center gap-2 rounded-md border bg-surface px-4 py-3 focus-within:outline focus-within:outline-2 focus-within:outline-action-primary-bg">
          <MagnifyingGlassIcon className="size-5 shrink-0 text-secondary" aria-hidden />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un programme"
            aria-label="Rechercher un programme"
            className="min-w-0 flex-1 bg-transparent text-corps text-primary outline-none placeholder:text-muted"
          />
        </label>
        <div className="flex items-center gap-3">
          {mesureEnCours && <span className="text-corps-petit text-muted">Mesure des tailles…</span>}
          <button
            type="button"
            onClick={() => setTri(tri === 'taille' ? 'nom' : 'taille')}
            title="Changer l'ordre"
            className="rounded-sm text-corps-petit text-secondary underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-action-primary-bg"
          >
            {tri === 'taille' ? 'Du plus gros au plus petit' : 'Par nom, de A à Z'}
          </button>
        </div>
      </div>

      {visibles.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visibles.map((p) => (
            <LigneProgramme key={p.id} programme={p} coche={selection.has(p.id)} onCocher={(c) => cocher(p.id, c)} />
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-corps text-secondary">
          {programmes.length === 0 ? 'Aucun programme à désinstaller.' : `Aucun programme ne correspond à « ${recherche.trim()} ».`}
        </p>
      )}

      {(liste?.components ?? 0) > 0 && (
        <p className="text-corps-petit text-secondary">
          {liste!.components} {pluriel(liste!.components, 'composant nécessaire', 'composants nécessaires')} à Windows ou à vos programmes
          (pilotes, bibliothèques Microsoft…) {liste!.components > 1 ? 'ne sont pas proposés' : "n'est pas proposé"}.
        </p>
      )}

      {/* Barre de sélection, collée au bas de la zone de contenu */}
      <div className="sticky bottom-0 -mx-12 -mb-12 mt-auto flex min-h-[88px] items-center gap-4 border-t bg-surface px-12 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-corps-gras text-primary">
            {choisis.length > 0 ? `${choisis.length} ${pluriel(choisis.length, 'programme sélectionné', 'programmes sélectionnés')}` : 'Aucun programme sélectionné'}
          </p>
          <p className="text-corps-petit text-secondary">
            {choisis.length === 0
              ? 'Cochez les programmes à désinstaller.'
              : totalChoisi > 0
                ? `Environ ${formatOctets(totalChoisi)} libérés${tailleInconnue ? ', plus les programmes de taille inconnue' : ''}`
                : 'Taille inconnue'}
          </p>
        </div>
        <Bouton onClick={() => setConfirmer(true)} disabled={choisis.length === 0}>Désinstaller</Bouton>
      </div>

      {confirmer && (
        <FenetreConfirmation
          icone={SquaresFourIcon}
          chiffre={totalChoisi > 0 ? formatOctets(totalChoisi) : undefined}
          titre={choisis.length > 1 ? `Désinstaller ${choisis.length} programmes ?` : `Désinstaller ${choisis[0].name} ?`}
          texte={`${choisis.length > 1 ? 'Chacun sera retiré' : 'Il sera retiré'} avec son propre outil de désinstallation. Vos documents, photos et fichiers ne sont pas touchés.`}
          libelleConfirmer="Désinstaller"
          onConfirmer={() => desinstaller(choisis)}
          onAnnuler={() => setConfirmer(false)}
        >
          <ul className="flex flex-col gap-3 rounded-lg border bg-neutre px-4 py-3">
            {choisis.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-sm bg-surface">
                  <PackageIcon className="size-5 text-secondary" />
                </div>
                <span className="min-w-0 flex-1 truncate text-left text-corps-gras text-primary">{p.name}</span>
                {p.sizeBytes !== null && <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(p.sizeBytes)}</span>}
              </li>
            ))}
            {choisis.length > 5 && (
              <li className="text-left text-corps-petit text-secondary">
                et {choisis.length - 5} {pluriel(choisis.length - 5, 'autre programme', 'autres programmes')}
              </li>
            )}
          </ul>
        </FenetreConfirmation>
      )}
    </>
  );
}
