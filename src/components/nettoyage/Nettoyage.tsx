import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircleIcon, MagnifyingGlassIcon, TrashIcon } from '@phosphor-icons/react';
import { Channel, invoke } from '@tauri-apps/api/core';
import type { Avancement, CleanResult, DiskSpace, ScanResult, ZoneInfo } from '../../types/commands';
import { formatListe, formatOctets } from '../../lib/format';
import Bandeau from '../ui/Bandeau';
import Bouton from '../ui/Bouton';
import BoutonScan from '../ui/BoutonScan';
import Carte from '../ui/Carte';
import FenetreConfirmation from '../ui/FenetreConfirmation';
import GraphiqueAnneau from '../ui/GraphiqueAnneau';
import ProgressionCirculaire from '../ui/ProgressionCirculaire';
import BilanNettoyage from './BilanNettoyage';
import GroupeZones from './GroupeZones';
import { GROUPES } from './groupes';

type Phase = 'accueil' | 'analyse' | 'resultats' | 'nettoyage' | 'termine';

interface ZoneFaite {
  id: string;
  libelle: string;
  octets: number;
}

/** Les deux dernières zones terminées, sous le cadran (« Corbeille · 4,8 Go »). */
function DernieresZones({ faites, suffixe }: { faites: ZoneFaite[]; suffixe: string }) {
  const dernieres = faites.filter((f) => f.octets > 0).slice(-2);
  if (dernieres.length === 0) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
      {dernieres.map((f) => (
        <li key={f.id} className="flex items-center gap-1.5 text-corps-petit text-secondary">
          <CheckCircleIcon className="size-4 text-status-ok-fg" />
          {f.libelle} · {formatOctets(f.octets)}{suffixe}
        </li>
      ))}
    </ul>
  );
}

const disques = () => invoke<DiskSpace[]>('system_get_disks').catch(() => [] as DiskSpace[]);

/** Onglet « Nettoyage » de la page Nettoyage. */
export default function Nettoyage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('accueil');
  const [zones, setZones] = useState<ZoneInfo[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [deplies, setDeplies] = useState<Set<string>>(new Set(['windows', 'navigateurs']));
  const [enCours, setEnCours] = useState<{ libelle: string; description: string } | null>(null);
  const [autorisation, setAutorisation] = useState(false);
  const [faites, setFaites] = useState<ZoneFaite[]>([]);
  const [confirmer, setConfirmer] = useState(false);
  const [arretDemande, setArretDemande] = useState(false);
  const [resultat, setResultat] = useState<CleanResult | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [disquesAvant, setDisquesAvant] = useState<DiskSpace[]>([]);
  const [disquesApres, setDisquesApres] = useState<DiskSpace[]>([]);
  // Une analyse annulée continue côté Rust (elle ne fait que lire) : on ignore sa réponse.
  const analyseCourante = useRef(0);

  const analyser = async () => {
    const numero = ++analyseCourante.current;
    setPhase('analyse');
    setFaites([]);
    setEnCours(null);
    setErreur(null);
    setResultat(null);

    const libelles = new Map<string, string>();
    const canal = new Channel<Avancement>();
    canal.onmessage = (a) => {
      if (analyseCourante.current !== numero) return;
      if (a.etape === 'debut') {
        libelles.set(a.id, a.libelle);
        setEnCours({ libelle: a.libelle, description: a.description });
      } else if (a.etape === 'fin') {
        setFaites((f) => [...f, { id: a.id, libelle: libelles.get(a.id) ?? '', octets: a.octets }]);
      }
    };

    try {
      const res = await invoke<ScanResult>('scan_get_zones', { onProgress: canal });
      if (analyseCourante.current !== numero) return;
      const trouvees = res.zones.filter((z) => z.sizeBytes > 0);
      setZones(trouvees);
      setSelection(new Set(trouvees.filter((z) => z.risque === 'sans_risque').map((z) => z.id)));
      setPhase('resultats');
    } catch (e) {
      console.warn('analyse du nettoyage', e);
      if (analyseCourante.current !== numero) return;
      setErreur("L'analyse n'a pas pu aboutir. Réessayez dans un instant.");
      setPhase('accueil');
    }
  };

  const annulerAnalyse = () => {
    analyseCourante.current++;
    setPhase('accueil');
  };

  const basculer = (ids: string[], coche: boolean) =>
    setSelection((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (coche ? next.add(id) : next.delete(id)));
      return next;
    });

  const deplier = (groupe: string) =>
    setDeplies((prev) => {
      const next = new Set(prev);
      if (next.has(groupe)) next.delete(groupe);
      else next.add(groupe);
      return next;
    });

  const choisies = zones.filter((z) => selection.has(z.id));
  const totalTrouve = zones.reduce((s, z) => s + z.sizeBytes, 0);
  const totalChoisi = choisies.reduce((s, z) => s + z.sizeBytes, 0);

  const nettoyer = async () => {
    setConfirmer(false);
    setPhase('nettoyage');
    setFaites([]);
    setEnCours(null);
    setAutorisation(false);
    setArretDemande(false);
    setErreur(null);
    setDisquesAvant(await disques());

    const parId = new Map(zones.map((z) => [z.id, z]));
    const canal = new Channel<Avancement>();
    canal.onmessage = (a) => {
      if (a.etape === 'debut') {
        setEnCours({ libelle: a.libelle, description: a.description });
      } else if (a.etape === 'fin') {
        setFaites((f) => [...f, { id: a.id, libelle: parId.get(a.id)?.libelle ?? '', octets: a.octets }]);
      } else {
        setAutorisation(true);
      }
    };

    try {
      setResultat(await invoke<CleanResult>('clean_zones', { ids: choisies.map((z) => z.id), onProgress: canal }));
    } catch (e) {
      console.warn('nettoyage', e);
      setResultat(null);
      setErreur("Le nettoyage s'est arrêté avant la fin. Relancez une analyse pour voir ce qu'il reste.");
    }
    setDisquesApres(await disques());
    setPhase('termine');
  };

  const arreter = () => {
    setArretDemande(true);
    invoke('clean_stop').catch(() => {});
  };

  const libere = faites.reduce((s, f) => s + f.octets, 0);
  const pourcent = totalChoisi > 0 ? Math.min(99, Math.round((libere / totalChoisi) * 100)) : 0;
  const totalAnalyse = faites.reduce((s, f) => s + f.octets, 0);

  // Applications ouvertes qui gardent une partie des zones cochées.
  const ouvertes = [...new Set(choisies.map((z) => z.lockedByProcess).filter((a): a is string => !!a))];
  const demandeAutorisation = choisies.some((z) => z.requiresAdmin);
  const ancienWindows = selection.has('ancien_windows');

  const texteConfirmation = [
    'Ces fichiers inutiles seront supprimés. Vos documents, photos et programmes ne sont pas touchés.',
    selection.has('corbeille') && 'La Corbeille sera vidée.',
    ancienWindows && 'Vous ne pourrez plus revenir à la version précédente de Windows.',
    demandeAutorisation && "Windows vous demandera l'autorisation pour certains dossiers.",
  ].filter(Boolean).join(' ');

  const segments = GROUPES.map((g) => {
    const valeur = choisies.filter((z) => z.groupe === g.id).reduce((s, z) => s + z.sizeBytes, 0);
    return { libelle: g.nom, valeur, valeurAffichee: formatOctets(valeur), couleur: g.couleur };
  }).filter((s) => s.valeur > 0);

  return (
    <>

      {phase === 'accueil' && (
        <div className="flex flex-col items-center gap-6 py-4 text-center">
          <BoutonScan libelle="Lancer le scan" onClick={analyser} />
          <p className="text-corps text-secondary">Cela prend quelques instants. Rien n'est supprimé sans votre accord.</p>
          {erreur && <Bandeau type="corriger">{erreur}</Bandeau>}
        </div>
      )}

      {phase === 'analyse' && (
        <div className="flex flex-col items-center gap-4 py-4 text-center" aria-live="polite">
          <ProgressionCirculaire libelle="Analyse en cours">
            <MagnifyingGlassIcon className="size-12 text-action-primary-bg" />
          </ProgressionCirculaire>
          <div className="flex flex-col gap-1">
            <p className="text-titre-3 font-titre text-primary">{enCours ? `Analyse : ${enCours.libelle}…` : 'Analyse en cours…'}</p>
            <p className="text-corps text-secondary">
              {enCours?.description}
              {totalAnalyse > 0 && `. ${formatOctets(totalAnalyse)} trouvés jusqu'ici.`}
            </p>
          </div>
          <DernieresZones faites={faites} suffixe="" />
          <Bouton variante="secondaire" taille="compact" onClick={annulerAnalyse}>Annuler</Bouton>
        </div>
      )}

      {phase === 'resultats' && zones.length === 0 && (
        <Carte className="flex items-center gap-6 px-8">
          <div className="grid size-[72px] shrink-0 place-items-center rounded-full bg-status-ok-bg">
            <CheckCircleIcon className="size-10 text-status-ok-fg" />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <h2 className="text-titre-2 text-primary">Votre PC est déjà propre</h2>
            <p className="text-corps text-secondary">Kernshine n'a rien trouvé d'inutile à supprimer pour le moment.</p>
          </div>
          <Bouton variante="secondaire" taille="compact" onClick={analyser}>Relancer</Bouton>
        </Carte>
      )}

      {phase === 'resultats' && zones.length > 0 && (
        <>
          <Carte className="flex items-center gap-6 px-8">
            <p className="whitespace-nowrap font-titre text-chiffre-grand text-primary">{formatOctets(totalTrouve, true)}</p>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-corps-gras text-primary">peuvent être libérés sur votre PC</p>
              <p className="text-corps-petit text-secondary">Analyse terminée. Décochez ce que vous souhaitez garder.</p>
            </div>
          </Carte>

          {ouvertes.length > 0 && (
            <Bandeau type="surveiller">
              {ouvertes.length > 1
                ? `${formatListe(ouvertes)} sont ouverts : une partie de leurs fichiers restera. Fermez-les pour tout nettoyer.`
                : `${ouvertes[0]} est ouvert : une partie de ses fichiers restera. Fermez-le pour tout nettoyer.`}
            </Bandeau>
          )}

          <div className="divide-y overflow-hidden rounded-xl border bg-surface">
            {GROUPES.map((g) => {
              const duGroupe = zones.filter((z) => z.groupe === g.id);
              if (duGroupe.length === 0) return null;
              return (
                <GroupeZones
                  key={g.id}
                  groupe={g}
                  zones={duGroupe}
                  selection={selection}
                  onBasculer={basculer}
                  deplie={deplies.has(g.id)}
                  onDeplier={() => deplier(g.id)}
                />
              );
            })}
          </div>

          {/* Barre de sélection, collée au bas de la zone de contenu */}
          <div className="sticky bottom-0 -mx-12 -mb-12 flex min-h-[88px] items-center gap-4 border-t bg-surface px-12 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-corps-gras text-primary">
                {choisies.length > 0 ? `${formatOctets(totalChoisi)} sélectionnés` : 'Rien de sélectionné'}
              </p>
              <p className="text-corps-petit text-secondary">sur {formatOctets(totalTrouve)} qui peuvent être libérés</p>
            </div>
            <Bouton onClick={() => setConfirmer(true)} disabled={choisies.length === 0}>Nettoyer</Bouton>
          </div>
        </>
      )}

      {phase === 'nettoyage' && (
        <div className="flex flex-col items-center gap-4 py-4 text-center" aria-live="polite">
          <ProgressionCirculaire valeur={pourcent} libelle="Nettoyage en cours">
            <p className="font-titre text-chiffre text-primary">{pourcent}&#8239;%</p>
            <p className="text-corps-petit text-secondary">nettoyé</p>
          </ProgressionCirculaire>
          <div className="flex flex-col gap-1">
            <p className="text-titre-3 font-titre text-primary">
              {autorisation
                ? "Windows vous demande l'autorisation"
                : enCours ? `Nettoyage : ${enCours.libelle}…` : 'Préparation du nettoyage…'}
            </p>
            <p className="text-corps text-secondary">
              {autorisation
                ? 'Cliquez sur « Oui » pour nettoyer les dossiers protégés de Windows.'
                : `${formatOctets(libere)} libérés sur ${formatOctets(totalChoisi)}. Ne fermez pas Kernshine pendant le nettoyage.`}
            </p>
          </div>
          <DernieresZones faites={faites} suffixe=" libérés" />
          <Bouton variante="secondaire" taille="compact" onClick={arreter} disabled={arretDemande || autorisation}>
            {arretDemande ? 'Arrêt en cours…' : 'Arrêter'}
          </Bouton>
        </div>
      )}

      {phase === 'termine' && (
        <BilanNettoyage
          zones={zones}
          selection={selection}
          resultat={resultat}
          erreur={erreur}
          disquesAvant={disquesAvant}
          disquesApres={disquesApres}
          onRelancer={analyser}
          onAccueil={() => navigate('/')}
          onGrosFichiers={() => navigate('/cleaning?onglet=gros-fichiers')}
        />
      )}

      {confirmer && (
        <FenetreConfirmation
          icone={TrashIcon}
          chiffre={formatOctets(totalChoisi)}
          titre="Nettoyer votre PC ?"
          texte={texteConfirmation}
          danger={ancienWindows}
          libelleConfirmer="Lancer le nettoyage"
          onConfirmer={nettoyer}
          onAnnuler={() => setConfirmer(false)}
        >
          <div className="flex flex-col gap-3">
            <GraphiqueAnneau segments={segments} centre={`${segments.length} zone${segments.length > 1 ? 's' : ''}`} />
            {ouvertes.length > 0 && (
              <Bandeau type="surveiller">
                {formatListe(ouvertes)} {ouvertes.length > 1 ? 'sont ouverts' : 'est ouvert'} : fermez-{ouvertes.length > 1 ? 'les' : 'le'} pour tout nettoyer.
              </Bandeau>
            )}
          </div>
        </FenetreConfirmation>
      )}
    </>
  );
}
