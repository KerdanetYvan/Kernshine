import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircleIcon, MagnifyingGlassIcon, WarningIcon } from '@phosphor-icons/react';
import { Channel, invoke } from '@tauri-apps/api/core';
import type { BigFile, BigFileDeleteResult, BigFileProgress, BigFileScan, DiskSpace } from '../../types/commands';
import { formatOctets, pluriel } from '../../lib/format';
import { usePrefs } from '../../hooks/usePrefs';
import Bandeau from '../ui/Bandeau';
import Bouton from '../ui/Bouton';
import BoutonScan from '../ui/BoutonScan';
import Carte from '../ui/Carte';
import FenetreConfirmation from '../ui/FenetreConfirmation';
import ProgressionCirculaire from '../ui/ProgressionCirculaire';
import BilanGrosFichiers from './BilanGrosFichiers';
import TrancheFichiers from './TrancheFichiers';
import { ICONES, TRANCHES, memoireGrosFichiers } from './fichiers';

type Phase = 'accueil' | 'recherche' | 'liste' | 'suppression' | 'termine';

interface DisqueFini {
  drive: string;
  files: number;
  bytes: number;
}

const disques = () => invoke<DiskSpace[]>('system_get_disks').catch(() => [] as DiskSpace[]);

/** Onglet « Gros fichiers » de la page Nettoyage. Rien n'est coché d'office : la suppression est définitive. */
export default function GrosFichiers() {
  const navigate = useNavigate();
  const { prefs } = usePrefs();
  const memo = memoireGrosFichiers.resultat;
  const [phase, setPhase] = useState<Phase>(memo ? 'liste' : 'accueil');
  const [fichiers, setFichiers] = useState<BigFile[]>(memo?.files ?? []);
  const [lecteurs, setLecteurs] = useState<string[]>(memo?.drives ?? []);
  const [filtre, setFiltre] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [deplies, setDeplies] = useState<Set<string>>(new Set(['plus5go', '1a5go']));
  const [enCours, setEnCours] = useState<{ drive: string; folder?: string } | null>(null);
  const [finis, setFinis] = useState<DisqueFini[]>([]);
  const [confirmer, setConfirmer] = useState(false);
  const [resultats, setResultats] = useState<BigFileDeleteResult[]>([]);
  const [disquesAvant, setDisquesAvant] = useState<DiskSpace[]>([]);
  const [disquesApres, setDisquesApres] = useState<DiskSpace[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurLien, setErreurLien] = useState<string | null>(null);
  const recherche = useRef(0);

  const rechercher = async () => {
    const numero = ++recherche.current;
    setPhase('recherche');
    setEnCours(null);
    setFinis([]);
    setErreur(null);
    setSelection(new Set());
    const canal = new Channel<BigFileProgress>();
    canal.onmessage = (a) => {
      if (recherche.current !== numero) return;
      if (a.etape === 'disque') setEnCours({ drive: a.drive });
      else if (a.etape === 'dossier') setEnCours({ drive: a.drive, folder: a.folder });
      else setFinis((f) => [...f, { drive: a.drive, files: a.files, bytes: a.bytes }]);
    };
    try {
      const res = await invoke<BigFileScan>('bigfiles_scan', { minMb: prefs.largeFileMinMb, onProgress: canal });
      if (recherche.current !== numero) return;
      memoireGrosFichiers.resultat = res;
      setFichiers(res.files);
      setLecteurs(res.drives);
      setFiltre(null);
      setPhase('liste');
    } catch (e) {
      console.warn('gros fichiers', e);
      if (recherche.current !== numero) return;
      setErreur("La recherche n'a pas pu aboutir. Réessayez dans un instant.");
      setPhase('accueil');
    }
  };

  const annuler = () => {
    recherche.current++;
    invoke('bigfiles_stop').catch(() => {});
    setPhase(memoireGrosFichiers.resultat ? 'liste' : 'accueil');
  };

  const basculer = (ids: string[], coche: boolean) =>
    setSelection((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (coche ? next.add(id) : next.delete(id)));
      return next;
    });

  const deplier = (id: string) =>
    setDeplies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const choisis = fichiers.filter((f) => selection.has(f.id));
  const totalChoisi = choisis.reduce((s, f) => s + f.sizeBytes, 0);

  const supprimer = async () => {
    setConfirmer(false);
    setPhase('suppression');
    setDisquesAvant(await disques());
    let res: BigFileDeleteResult[] = [];
    try {
      res = await invoke<BigFileDeleteResult[]>('bigfiles_delete', { ids: choisis.map((f) => f.id) });
    } catch (e) {
      console.warn('gros fichiers', e);
      res = choisis.map((f) => ({ id: f.id, status: 'denied', freedBytes: 0 }));
    }
    setResultats(res);
    setDisquesApres(await disques());
    // Les fichiers supprimés quittent la liste gardée en mémoire.
    const partis = new Set(res.filter((r) => r.status === 'ok' || r.status === 'missing').map((r) => r.id));
    if (memoireGrosFichiers.resultat) {
      memoireGrosFichiers.resultat = { ...memoireGrosFichiers.resultat, files: memoireGrosFichiers.resultat.files.filter((f) => !partis.has(f.id)) };
    }
    setPhase('termine');
  };

  // ── Affichage ──

  if (phase === 'accueil') {
    return (
      <div className="flex flex-col items-center gap-6 py-4 text-center">
        <BoutonScan libelle="Lancer la recherche" onClick={rechercher} />
        <p className="text-corps text-secondary">Kernshine cherche les fichiers les plus lourds de votre PC. Rien n'est supprimé sans votre accord.</p>
        {erreur && <Bandeau type="corriger">{erreur}</Bandeau>}
      </div>
    );
  }

  if (phase === 'recherche') {
    const trouves = finis.reduce((s, d) => s + d.files, 0);
    const octets = finis.reduce((s, d) => s + d.bytes, 0);
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center" aria-live="polite">
        <ProgressionCirculaire libelle="Recherche des gros fichiers">
          <MagnifyingGlassIcon className="size-12 text-action-primary-bg" />
        </ProgressionCirculaire>
        <div className="flex flex-col gap-1">
          <p className="font-titre text-titre-3 text-primary">{enCours ? `Recherche dans le disque ${enCours.drive}…` : 'Recherche des gros fichiers…'}</p>
          <p className="text-corps text-secondary">
            {enCours?.folder && `Dossier ${enCours.folder}. `}
            {trouves > 0 && `${trouves} ${pluriel(trouves, 'gros fichier trouvé', 'gros fichiers trouvés')} jusqu'ici, soit ${formatOctets(octets)}.`}
          </p>
        </div>
        {finis.length > 0 && (
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {finis.slice(-2).map((d) => (
              <li key={d.drive} className="flex items-center gap-1.5 text-corps-petit text-secondary">
                <CheckCircleIcon className="size-4 text-status-ok-fg" />
                Disque {d.drive} · {d.files} {pluriel(d.files, 'fichier')} · {formatOctets(d.bytes)}
              </li>
            ))}
          </ul>
        )}
        <Bouton variante="secondaire" taille="compact" onClick={annuler}>Annuler</Bouton>
      </div>
    );
  }

  if (phase === 'suppression') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center" aria-live="polite">
        <ProgressionCirculaire libelle="Suppression en cours">
          <WarningIcon className="size-12 text-status-danger-fg" />
        </ProgressionCirculaire>
        <p className="font-titre text-titre-3 text-primary">Suppression de {choisis.length} {pluriel(choisis.length, 'fichier')}…</p>
      </div>
    );
  }

  if (phase === 'termine') {
    return (
      <BilanGrosFichiers
        fichiers={fichiers}
        resultats={resultats}
        restants={fichiers.filter((f) => !selection.has(f.id))}
        disquesAvant={disquesAvant}
        disquesApres={disquesApres}
        onRelancer={rechercher}
        onProgrammes={() => navigate('/applications?onglet=desinstallation')}
        onAccueil={() => navigate('/')}
      />
    );
  }

  // phase === 'liste'
  const visibles = filtre ? fichiers.filter((f) => f.drive === filtre) : fichiers;
  const total = visibles.reduce((s, f) => s + f.sizeBytes, 0);

  if (fichiers.length === 0) {
    return (
      <Carte className="flex items-center gap-6 px-8">
        <div className="grid size-[72px] shrink-0 place-items-center rounded-full bg-status-ok-bg">
          <CheckCircleIcon className="size-10 text-status-ok-fg" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <h2 className="text-titre-2 text-primary">Aucun gros fichier</h2>
          <p className="text-corps text-secondary">
            Kernshine n'a trouvé aucun fichier de plus de {formatOctets(prefs.largeFileMinMb * 1024 * 1024)} dans vos dossiers.
          </p>
        </div>
        <Bouton variante="secondaire" taille="compact" onClick={rechercher}>Relancer</Bouton>
      </Carte>
    );
  }

  return (
    <>
      <Carte className="flex items-center gap-6 px-8">
        <p className="whitespace-nowrap font-titre text-chiffre-grand text-primary">{formatOctets(total, true)}</p>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-corps-gras text-primary">
            occupés par {visibles.length} {pluriel(visibles.length, 'gros fichier', 'gros fichiers')}
          </p>
          <p className="text-corps-petit text-secondary">Rien n'est coché. Choisissez ce que vous voulez supprimer : la suppression est définitive.</p>
        </div>
      </Carte>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Disque" className="flex flex-wrap gap-2">
          {[null, ...lecteurs].map((l) => (
            <button
              key={l ?? 'tous'}
              type="button"
              role="radio"
              aria-checked={filtre === l}
              onClick={() => setFiltre(l)}
              className={`rounded-full px-4 py-2 text-libelle transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-bg ${
                filtre === l ? 'bg-action-primary-bg text-action-primary-fg' : 'border bg-surface text-primary hover:bg-subtle'
              }`}
            >
              {l ? `Disque ${l}` : 'Tous les disques'}
            </button>
          ))}
        </div>
        <p className="text-corps-petit text-secondary">Du plus gros au plus petit</p>
      </div>

      {erreurLien && <Bandeau type="surveiller" onFermer={() => setErreurLien(null)}>{erreurLien}</Bandeau>}

      <div className="divide-y overflow-hidden rounded-xl border bg-surface">
        {TRANCHES.map((t) => {
          const dans = visibles.filter((f) => f.sizeBytes >= t.min && f.sizeBytes < t.max);
          if (dans.length === 0) return null;
          return (
            <TrancheFichiers
              key={t.id}
              nom={t.nom}
              fichiers={dans}
              selection={selection}
              onBasculer={basculer}
              deplie={deplies.has(t.id)}
              onDeplier={() => deplier(t.id)}
              onErreur={setErreurLien}
            />
          );
        })}
      </div>

      {/* Barre de sélection, collée au bas de la zone de contenu */}
      <div className="sticky bottom-0 -mx-12 -mb-12 mt-auto flex min-h-[88px] items-center gap-4 border-t bg-surface px-12 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-corps-gras text-primary">{choisis.length > 0 ? `${formatOctets(totalChoisi)} sélectionnés` : 'Aucun fichier sélectionné'}</p>
          <p className="text-corps-petit text-secondary">
            {choisis.length > 0
              ? `${choisis.length} ${pluriel(choisis.length, 'fichier')} · suppression définitive, impossible à annuler`
              : 'Cochez les fichiers à supprimer. La suppression est définitive.'}
          </p>
        </div>
        <Bouton variante="danger" onClick={() => setConfirmer(true)} disabled={choisis.length === 0}>Supprimer définitivement</Bouton>
      </div>

      {confirmer && (
        <FenetreConfirmation
          icone={WarningIcon}
          chiffre={formatOctets(totalChoisi)}
          titre={`Supprimer ${choisis.length} ${pluriel(choisis.length, 'fichier')} définitivement ?`}
          texte={`${choisis.length > 1 ? 'Ils ne passent' : 'Il ne passe'} pas par la corbeille : vous ne pourrez pas ${choisis.length > 1 ? 'les' : 'le'} récupérer.`}
          danger
          libelleConfirmer="Supprimer définitivement"
          onConfirmer={supprimer}
          onAnnuler={() => setConfirmer(false)}
        >
          <ul className="flex flex-col gap-3 rounded-lg border bg-neutre px-4 py-3">
            {choisis.slice(0, 5).map((f) => {
              const Icone = ICONES[f.kind];
              return (
                <li key={f.id} className="flex items-center gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-sm bg-surface">
                    <Icone className="size-5 text-secondary" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-corps-gras text-primary">{f.name}</span>
                      <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(f.sizeBytes)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-piste">
                      <div className="h-full rounded-full bg-status-danger-fg" style={{ width: `${(f.sizeBytes / choisis[0].sizeBytes) * 100}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
            {choisis.length > 5 && (
              <li className="text-corps-petit text-secondary">
                et {choisis.length - 5} {pluriel(choisis.length - 5, 'autre fichier', 'autres fichiers')}
              </li>
            )}
          </ul>
        </FenetreConfirmation>
      )}
    </>
  );
}
