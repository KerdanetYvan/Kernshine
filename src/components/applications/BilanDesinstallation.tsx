import { CheckCircleIcon, WarningIcon } from '@phosphor-icons/react';
import type { DiskSpace, InstalledProgram, UninstallResult, UninstallStatus } from '../../types/commands';
import { etatDisque, formatListe, formatOctets, pluriel } from '../../lib/format';
import Bandeau from '../ui/Bandeau';
import Bouton from '../ui/Bouton';
import Carte from '../ui/Carte';
import Pastille from '../ui/Pastille';

interface BilanDesinstallationProps {
  programmes: InstalledProgram[];
  resultats: UninstallResult[];
  disquesAvant: DiskSpace[];
  disquesApres: DiskSpace[];
  onReessayer: (programmes: InstalledProgram[]) => void;
  onGrosFichiers: () => void;
  onVoirProgrammes: () => void;
  onAccueil: () => void;
}

const RAISONS: Partial<Record<UninstallStatus, string>> = {
  still_there: 'la désinstallation a été annulée ou sa fenêtre fermée avant la fin',
  refused: "Windows n'a pas reçu l'autorisation",
  error: "son outil de désinstallation ne s'est pas lancé",
  skipped: 'arrêté avant lui',
};

/** Bilan de la désinstallation (Figma : « Applications – Désinstallation – Terminé »). */
export default function BilanDesinstallation({
  programmes, resultats, disquesAvant, disquesApres, onReessayer, onGrosFichiers, onVoirProgrammes, onAccueil,
}: BilanDesinstallationProps) {
  const statut = new Map(resultats.map((r) => [r.id, r.status]));
  const retires = programmes.filter((p) => statut.get(p.id) === 'removed');
  // `missing` : l'entrée a disparu de la liste de Windows entre-temps, le programme n'est plus là.
  const restes = programmes.filter((p) => !['removed', 'missing'].includes(statut.get(p.id) ?? ''));
  // Disques des programmes retirés : la place libre y est mesurée avant et après.
  const disques = [...new Set(retires.map((p) => p.drive ?? 'C:'))].sort();
  const noms = (liste: InstalledProgram[]) => formatListe(liste.map((p) => p.name), 10);

  return (
    <div className="flex flex-col gap-8">
      <Carte className="flex items-center gap-6 px-8">
        <div className={`grid size-[72px] shrink-0 place-items-center rounded-full ${restes.length === 0 ? 'bg-status-ok-bg' : 'bg-status-warning-bg'}`}>
          {restes.length === 0 ? <CheckCircleIcon className="size-10 text-status-ok-fg" /> : <WarningIcon className="size-10 text-status-warning-fg" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-titre-1 text-primary">
            {retires.length > 0 ? `${retires.length} ${pluriel(retires.length, 'programme désinstallé', 'programmes désinstallés')}` : 'Aucun programme désinstallé'}
          </h2>
          {retires.length > 0 && (
            <p className="text-corps text-secondary">
              {noms(retires)} {retires.length > 1 ? 'ont été retirés' : 'a été retiré'} de votre PC.
            </p>
          )}
          {disques.map((l) => {
            const avant = disquesAvant.find((d) => d.letter === l);
            const apres = disquesApres.find((d) => d.letter === l);
            return apres ? (
              <p key={l} className="text-corps text-secondary">
                Disque {l} {avant ? `de ${formatOctets(avant.freeBytes)} à ` : ''}{formatOctets(apres.freeBytes)} libres.
              </p>
            ) : null;
          })}
        </div>
        <div className="flex shrink-0 gap-6">
          {disquesApres.filter((d) => disques.includes(d.letter)).map((d) => (
            <div key={d.letter} className="flex flex-col items-start gap-1.5">
              <p className="text-legende text-secondary">État du disque {d.letter}</p>
              <Pastille statut={etatDisque(d.freeBytes, d.totalBytes)} />
            </div>
          ))}
        </div>
      </Carte>

      {retires.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-titre-3 text-primary">Ce qui a été désinstallé</h2>
          <ul className="flex flex-col gap-3">
            {retires.map((p) => (
              <li key={p.id} className="flex items-center gap-4 rounded-lg border bg-surface py-3 pl-3 pr-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-md bg-brand-shield-fill">
                  <CheckCircleIcon className="size-6 text-brand-shield-stroke" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-corps-gras text-primary">{p.name}</p>
                  {p.publisher && <p className="truncate text-corps-petit text-secondary">{p.publisher}</p>}
                </div>
                {p.sizeBytes !== null && <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(p.sizeBytes)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {restes.length > 0 && (
        <Bandeau
          type="surveiller"
          action={{ libelle: 'Réessayer', onClick: () => onReessayer(restes) }}
        >
          {restes.length > 1 ? 'Ces programmes sont toujours sur votre PC : ' : 'Ce programme est toujours sur votre PC : '}
          {formatListe(restes.map((p) => `${p.name} (${RAISONS[statut.get(p.id) ?? 'error'] ?? 'pas désinstallé'})`), 10)}.
        </Bandeau>
      )}

      <Bandeau type="info" action={{ libelle: 'Chercher les gros fichiers', onClick: onGrosFichiers }}>
        Vous pouvez aussi chercher les gros fichiers pour libérer encore de la place.
      </Bandeau>

      <div className="flex justify-end gap-3">
        <Bouton variante="secondaire" onClick={onVoirProgrammes}>Voir les programmes</Bouton>
        <Bouton onClick={onAccueil}>Retour à l'accueil</Bouton>
      </div>
    </div>
  );
}
