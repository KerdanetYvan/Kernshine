import { CheckCircleIcon } from '@phosphor-icons/react';
import type { CleanResult, DiskSpace, ZoneInfo } from '../../types/commands';
import { etatDisque, formatListe, formatOctets } from '../../lib/format';
import Bandeau from '../ui/Bandeau';
import Bouton from '../ui/Bouton';
import Carte from '../ui/Carte';
import Pastille from '../ui/Pastille';
import { GROUPES, resumeGroupe } from './groupes';

interface BilanNettoyageProps {
  zones: ZoneInfo[];
  selection: Set<string>;
  resultat: CleanResult | null;
  /** Message simple si le nettoyage n'a pas pu aller au bout. */
  erreur: string | null;
  disquesAvant: DiskSpace[];
  disquesApres: DiskSpace[];
  onRelancer: () => void;
  onAccueil: () => void;
}

// En dessous, la différence vient du reste de la machine, pas du nettoyage.
const VARIATION_NOTABLE = 50 * 1024 * 1024;

/** Écran « Terminé » du nettoyage (Figma : « Nettoyage – Terminé »). */
export default function BilanNettoyage({
  zones, selection, resultat, erreur, disquesAvant, disquesApres, onRelancer, onAccueil,
}: BilanNettoyageProps) {
  const libere = resultat?.freedBytes ?? 0;
  const parId = new Map(zones.map((z) => [z.id, z]));
  const statuts = new Map((resultat?.zones ?? []).map((r) => [r.id, r]));

  const nettoyes = GROUPES.map((g) => {
    const faites = zones.filter((z) => z.groupe === g.id && statuts.get(z.id)?.status !== 'skipped' && (statuts.get(z.id)?.freedBytes ?? 0) > 0);
    return { ...g, zones: faites, octets: faites.reduce((s, z) => s + (statuts.get(z.id)?.freedBytes ?? 0), 0) };
  }).filter((g) => g.zones.length > 0);

  const gardees = zones.filter((z) => !selection.has(z.id));
  const ratees = (resultat?.zones ?? []).filter((r) => r.status === 'partial' || r.status === 'failed');
  const sautees = (resultat?.zones ?? []).filter((r) => r.status === 'skipped');
  const noms = (ids: { id: string }[]) => formatListe(ids.map((r) => parId.get(r.id)?.libelle ?? r.id), 10);

  const titre = libere === 0
    ? 'Le nettoyage est terminé'
    : resultat?.stopped
      ? `Nettoyage arrêté : ${formatOctets(libere)} libérés`
      : `${formatOctets(libere)} libérés`;

  return (
    <div className="flex flex-col gap-8">
      <Carte className="flex items-center gap-6 px-8">
        <div className="grid size-[72px] shrink-0 place-items-center rounded-full bg-status-ok-bg">
          <CheckCircleIcon className="size-10 text-status-ok-fg" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-titre-1 text-primary">{titre}</h2>
          {disquesApres.map((apres) => {
            const avant = disquesAvant.find((d) => d.letter === apres.letter);
            const change = avant && Math.abs(apres.freeBytes - avant.freeBytes) >= VARIATION_NOTABLE;
            return (
              <p key={apres.letter} className="text-corps text-secondary">
                Disque {apres.letter}{' '}
                {change ? `de ${formatOctets(avant.freeBytes)} à ${formatOctets(apres.freeBytes)} libres.` : `${formatOctets(apres.freeBytes)} libres.`}
              </p>
            );
          })}
        </div>
        <div className="flex shrink-0 gap-6">
          {disquesApres.map((d) => (
            <div key={d.letter} className="flex flex-col items-start gap-1.5">
              <p className="text-legende text-secondary">État du disque {d.letter}</p>
              <Pastille statut={etatDisque(d.freeBytes, d.totalBytes)} />
            </div>
          ))}
        </div>
      </Carte>

      {erreur && <Bandeau type="corriger">{erreur}</Bandeau>}

      {nettoyes.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-titre-3 text-primary">Ce qui a été nettoyé</h2>
          <ul className="flex flex-col gap-3">
            {nettoyes.map((g) => (
              <li key={g.id} className="flex items-center gap-4 rounded-lg border bg-surface py-3 pl-3 pr-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-md bg-brand-shield-fill">
                  <CheckCircleIcon className="size-6 text-brand-shield-stroke" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-corps-gras text-primary">{g.nom}</p>
                  <p className="truncate text-corps-petit text-secondary">{resumeGroupe(g.id, g.zones)}</p>
                </div>
                <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(g.octets)}</span>
              </li>
            ))}
          </ul>
          {gardees.length > 0 && (
            <p className="text-corps-petit text-secondary">
              Non nettoyé, à votre demande : {formatListe(gardees.map((z) => `${z.libelle} (${formatOctets(z.sizeBytes)})`), 10)}.
            </p>
          )}
        </section>
      )}

      {ratees.length > 0 && (
        <Bandeau type="surveiller">
          Une partie n'a pas pu être nettoyée : {noms(ratees)}. Un programme ouvert utilisait sans doute ces fichiers :
          fermez-le, puis relancez une analyse.
        </Bandeau>
      )}
      {sautees.length > 0 && <Bandeau type="info">Arrêté avant : {noms(sautees)}. Rien n'y a été supprimé.</Bandeau>}

      <div className="flex justify-end gap-3">
        <Bouton variante="secondaire" onClick={onRelancer}>Relancer une analyse</Bouton>
        <Bouton onClick={onAccueil}>Retour à l'accueil</Bouton>
      </div>
    </div>
  );
}
