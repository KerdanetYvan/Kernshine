import { CheckCircleIcon, WarningIcon } from '@phosphor-icons/react';
import type { Driver } from '../../types/commands';
import { formatListe, formatOctets, pluriel } from '../../lib/format';
import Bouton from '../ui/Bouton';
import Carte from '../ui/Carte';
import Pastille from '../ui/Pastille';
import type { EtatEtape } from './InstallationPilotes';
import { versionsPilote } from './texte';

interface BilanPilotesProps {
  pilotes: Driver[];
  etats: Map<string, EtatEtape>;
  /** Pilotes qui demandent un redémarrage pour finir leur installation. */
  aRedemarrer: Driver[];
  pointDeRestauration: boolean;
  onRedemarrer: () => void;
  onVerifier: () => void;
  onAccueil: () => void;
}

/** Bilan de l'installation des pilotes (Figma : « Pilotes – Terminé »). */
export default function BilanPilotes({ pilotes, etats, aRedemarrer, pointDeRestauration, onRedemarrer, onVerifier, onAccueil }: BilanPilotesProps) {
  const faits = pilotes.filter((p) => etats.get(p.id) === 'ok');
  const rates = pilotes.filter((p) => etats.get(p.id) === 'echec');
  const arretes = pilotes.filter((p) => etats.get(p.id) === 'arrete' || !etats.has(p.id));
  const redemarrer = aRedemarrer.length > 0;
  const toutBon = rates.length === 0 && arretes.length === 0;

  const detail = redemarrer
    ? `Redémarrez votre PC pour terminer l'installation : ${formatListe(aRedemarrer.map((p) => p.name), 10)}.`
    : faits.length > 0 ? 'Les nouveaux pilotes sont déjà en service.' : '';

  return (
    <div className="flex flex-col gap-8">
      <Carte className="flex items-center gap-6 px-8">
        <div className={`grid size-[72px] shrink-0 place-items-center rounded-full ${toutBon ? 'bg-status-ok-bg' : 'bg-status-warning-bg'}`}>
          {toutBon ? <CheckCircleIcon className="size-10 text-status-ok-fg" /> : <WarningIcon className="size-10 text-status-warning-fg" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-titre-1 text-primary">
            {faits.length > 0 ? `${faits.length} ${pluriel(faits.length, 'pilote')} à jour` : 'Aucun pilote mis à jour'}
          </h2>
          {detail && <p className="text-corps text-secondary">{detail}</p>}
        </div>
        {redemarrer && (
          <div className="flex shrink-0 flex-col items-start gap-1.5">
            <p className="text-legende text-secondary">Redémarrage</p>
            <Pastille statut="surveiller">À faire</Pastille>
          </div>
        )}
      </Carte>

      {faits.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-titre-3 text-primary">Ce qui a été mis à jour</h2>
          <ul className="flex flex-col gap-3">
            {faits.map((p) => (
              <li key={p.id} className="flex items-center gap-4 rounded-lg border bg-surface py-3 pl-3 pr-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-md bg-brand-shield-fill">
                  <CheckCircleIcon className="size-6 text-brand-shield-stroke" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-corps-gras text-primary">{p.name}</p>
                  <p className="text-corps-petit text-secondary">{versionsPilote(p)}</p>
                </div>
                {p.sizeBytes > 0 && <span className="whitespace-nowrap text-corps-gras text-primary">{formatOctets(p.sizeBytes)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(rates.length > 0 || arretes.length > 0) && (
        <section className="flex flex-col gap-4">
          <h2 className="text-titre-3 text-primary">Pas installés</h2>
          <ul className="flex flex-col gap-3">
            {[...rates, ...arretes].map((p) => (
              <li key={p.id} className="flex items-center gap-4 rounded-lg border bg-surface py-3 pl-3 pr-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-md bg-status-warning-bg">
                  <WarningIcon className="size-6 text-status-warning-fg" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-corps-gras text-primary">{p.name}</p>
                  <p className="text-corps-petit text-secondary">
                    {etats.get(p.id) === 'echec'
                      ? "L'installation n'a pas abouti. Réessayez plus tard : Windows le propose souvent de nouveau."
                      : "Arrêté avant son installation : rien n'a changé pour ce pilote."}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-corps-petit text-secondary">
        {pointDeRestauration
          ? "Un point de restauration a été créé avant l'installation : vous pouvez revenir en arrière depuis Windows si besoin."
          : "Aucun point de restauration n'a été créé, à votre demande."}
      </p>

      <div className="flex flex-wrap justify-end gap-3">
        {redemarrer ? (
          <>
            <Bouton variante="secondaire" onClick={onAccueil}>Plus tard</Bouton>
            <Bouton onClick={onRedemarrer}>Redémarrer maintenant</Bouton>
          </>
        ) : (
          <>
            <Bouton variante="secondaire" onClick={onVerifier}>Vérifier à nouveau</Bouton>
            <Bouton onClick={onAccueil}>Retour à l'accueil</Bouton>
          </>
        )}
      </div>
    </div>
  );
}
