import { CheckCircleIcon } from '@phosphor-icons/react';
import type { BigFile, BigFileDeleteResult, DiskSpace } from '../../types/commands';
import { etatDisque, formatListe, formatOctets, pluriel } from '../../lib/format';
import Bandeau from '../ui/Bandeau';
import Bouton from '../ui/Bouton';
import Carte from '../ui/Carte';
import Pastille from '../ui/Pastille';

interface BilanGrosFichiersProps {
  fichiers: BigFile[];
  resultats: BigFileDeleteResult[];
  /** Fichiers trouvés mais pas cochés. */
  restants: BigFile[];
  disquesAvant: DiskSpace[];
  disquesApres: DiskSpace[];
  onRelancer: () => void;
  /** Vers l'onglet Désinstallation de la page Applications. */
  onProgrammes: () => void;
  onAccueil: () => void;
}

const PROBLEMES: Partial<Record<BigFileDeleteResult['status'], string>> = {
  in_use: 'ouvert dans un programme : fermez-le, puis relancez la recherche',
  changed: 'a changé depuis la recherche : relancez-la pour le revoir',
  missing: "n'existe plus à cet endroit",
  denied: 'Windows refuse de le supprimer',
  unknown: 'introuvable dans la dernière recherche : relancez-la',
};

/** Bilan de la suppression (Figma : « Gros fichiers – Terminé »). */
export default function BilanGrosFichiers({ fichiers, resultats, restants, disquesAvant, disquesApres, onRelancer, onProgrammes, onAccueil }: BilanGrosFichiersProps) {
  const parId = new Map(fichiers.map((f) => [f.id, f]));
  const supprimes = resultats.filter((r) => r.status === 'ok').map((r) => parId.get(r.id)!).filter(Boolean);
  const rates = resultats.filter((r) => r.status !== 'ok');
  const libere = resultats.reduce((s, r) => s + r.freedBytes, 0);
  const disquesTouches = [...new Set(supprimes.map((f) => f.drive))];

  return (
    <div className="flex flex-col gap-8">
      <Carte className="flex items-center gap-6 px-8">
        <div className="grid size-[72px] shrink-0 place-items-center rounded-full bg-status-ok-bg">
          <CheckCircleIcon className="size-10 text-status-ok-fg" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-titre-1 text-primary">{libere > 0 ? `${formatOctets(libere)} libérés` : 'Aucun fichier supprimé'}</h2>
          {disquesTouches.map((l) => {
            const avant = disquesAvant.find((d) => d.letter === l);
            const apres = disquesApres.find((d) => d.letter === l);
            return apres ? (
              <p key={l} className="text-corps text-secondary">
                Disque {l} {avant ? `de ${formatOctets(avant.freeBytes)} à ` : ''}{formatOctets(apres.freeBytes)} libres.
              </p>
            ) : null;
          })}
          {supprimes.length > 0 && <p className="text-corps text-secondary">Ces fichiers sont supprimés définitivement.</p>}
        </div>
        <div className="flex shrink-0 gap-6">
          {disquesApres.filter((d) => disquesTouches.includes(d.letter)).map((d) => (
            <div key={d.letter} className="flex flex-col items-start gap-1.5">
              <p className="text-legende text-secondary">État du disque {d.letter}</p>
              <Pastille statut={etatDisque(d.freeBytes, d.totalBytes)} />
            </div>
          ))}
        </div>
      </Carte>

      {supprimes.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-titre-3 text-primary">Ce qui a été supprimé</h2>
          <ul className="flex flex-col gap-3">
            {supprimes.map((f) => (
              <li key={f.id} className="flex items-center gap-4 rounded-lg border bg-surface py-3 pl-3 pr-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-md bg-brand-shield-fill">
                  <CheckCircleIcon className="size-6 text-brand-shield-stroke" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-corps-gras text-primary">{f.name}</p>
                  <p className="truncate text-corps-petit text-secondary">{f.location.join(' › ')}</p>
                </div>
                <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(f.sizeBytes)}</span>
              </li>
            ))}
          </ul>
          {restants.length > 0 && (
            <p className="text-corps-petit text-secondary">
              Il reste {restants.length} {pluriel(restants.length, 'gros fichier non sélectionné', 'gros fichiers non sélectionnés')}, soit{' '}
              {formatOctets(restants.reduce((s, f) => s + f.sizeBytes, 0))}.
            </p>
          )}
        </section>
      )}

      {rates.length > 0 && (
        <Bandeau type="surveiller">
          {rates.length > 1 ? 'Ces fichiers sont restés : ' : 'Ce fichier est resté : '}
          {formatListe(rates.map((r) => `${parId.get(r.id)?.name ?? r.id} (${PROBLEMES[r.status] ?? 'non supprimé'})`), 10)}.
        </Bandeau>
      )}

      <Bandeau type="info" action={{ libelle: 'Voir les programmes', onClick: onProgrammes }}>
        Vous pouvez aussi désinstaller les programmes que vous n'utilisez plus.
      </Bandeau>

      <div className="flex justify-end gap-3">
        <Bouton variante="secondaire" onClick={onRelancer}>Relancer la recherche</Bouton>
        <Bouton onClick={onAccueil}>Retour à l'accueil</Bouton>
      </div>
    </div>
  );
}
