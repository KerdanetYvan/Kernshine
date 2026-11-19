import { CheckCircleIcon, WarningIcon } from '@phosphor-icons/react';
import type { SoftwareUpdate } from '../../types/commands';
import { formatListe, pluriel } from '../../lib/format';
import Bouton from '../ui/Bouton';
import Carte from '../ui/Carte';
import Pastille from '../ui/Pastille';
import type { StatutInstallation } from './InstallationEnCours';
import { versions } from './versions';

interface BilanMisesAJourProps {
  paquets: SoftwareUpdate[];
  statuts: Map<string, StatutInstallation>;
  /** Applications laissées décochées parce qu'elles étaient ouvertes. */
  ouvertesNonFaites: SoftwareUpdate[];
  /** Programmes en train d'être réessayés avec autorisation ou fermés. */
  enCours: Set<string>;
  logFile: string | null;
  onReessayer: (pkg: SoftwareUpdate) => void;
  onFermer: (pkg: SoftwareUpdate) => void;
  onOuvrirRapport: () => void;
  onVerifier: () => void;
  onAccueil: () => void;
}

/** Bilan des mises à jour (Figma : « Applications – Mises à jour – Terminé »). */
export default function BilanMisesAJour({
  paquets, statuts, ouvertesNonFaites, enCours, logFile, onReessayer, onFermer, onOuvrirRapport, onVerifier, onAccueil,
}: BilanMisesAJourProps) {
  const statut = (p: SoftwareUpdate) => statuts.get(p.id);
  const faits = paquets.filter((p) => statut(p)?.status === 'ok' && statut(p)?.verification !== 'still_outdated');
  const aReprendre = paquets.filter((p) => statut(p)?.status === 'error' || (statut(p)?.status === 'ok' && statut(p)?.verification === 'still_outdated'));
  const arretes = paquets.filter((p) => statut(p)?.status === 'skipped');
  const autorisation = aReprendre.filter((p) => statut(p)?.kind === 'needs_permission');
  const toutBon = aReprendre.length === 0 && ouvertesNonFaites.length === 0 && arretes.length === 0;

  const noms = (liste: SoftwareUpdate[]) => formatListe(liste.map((p) => p.name), 10);
  const details = [
    autorisation.length > 0 && `${noms(autorisation)} ${autorisation.length > 1 ? 'attendent' : 'attend'} votre autorisation.`,
    ouvertesNonFaites.length > 0 &&
      `${noms(ouvertesNonFaites)} ${ouvertesNonFaites.length > 1 ? 'étaient ouvertes : leurs mises à jour' : 'était ouverte : sa mise à jour'} n'${ouvertesNonFaites.length > 1 ? 'ont' : 'a'} pas été installée${ouvertesNonFaites.length > 1 ? 's' : ''}.`,
    arretes.length > 0 && `Arrêté avant : ${noms(arretes)}.`,
  ].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-8">
      <Carte className="flex items-center gap-6 px-8">
        <div className={`grid size-[72px] shrink-0 place-items-center rounded-full ${toutBon ? 'bg-status-ok-bg' : 'bg-status-warning-bg'}`}>
          {toutBon ? <CheckCircleIcon className="size-10 text-status-ok-fg" /> : <WarningIcon className="size-10 text-status-warning-fg" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-titre-1 text-primary">
            {faits.length > 0
              ? `${faits.length} ${pluriel(faits.length, 'application')} à jour`
              : 'Aucune application mise à jour'}
          </h2>
          {details && <p className="text-corps text-secondary">{details}</p>}
        </div>
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
                  <p className="text-corps-petit text-secondary">{versions(p)}</p>
                </div>
                {statut(p)?.reboot === 'app' && <Pastille statut="info">Redémarrez l'application</Pastille>}
                {statut(p)?.reboot === 'system' && <Pastille statut="info">Redémarrez le PC</Pastille>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {aReprendre.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-titre-3 text-primary">Pas encore à jour</h2>
          <ul className="flex flex-col gap-3">
            {aReprendre.map((p) => {
              const s = statut(p);
              const occupe = enCours.has(p.id);
              const ancienne = s?.status === 'ok' && s.verification === 'still_outdated';
              return (
                <li key={p.id} className="flex items-center gap-4 rounded-lg border bg-surface py-3 pl-3 pr-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-md bg-status-warning-bg">
                    <WarningIcon className="size-6 text-status-warning-fg" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-corps-gras text-primary">{p.name}</p>
                    <p className="text-corps-petit text-secondary">
                      {s?.closeMsg ?? (ancienne ? "Installée, mais l'ancienne version est toujours détectée. Vérifiez à nouveau plus tard." : s?.reason ?? 'La mise à jour a échoué.')}
                    </p>
                  </div>
                  {s?.kind === 'needs_permission' && (
                    <Bouton variante="secondaire" taille="compact" onClick={() => onReessayer(p)} disabled={occupe}>
                      {occupe ? 'Installation…' : 'Réessayer avec autorisation'}
                    </Bouton>
                  )}
                  {s?.kind === 'close_app' && !s.closeMsg && (
                    <Bouton variante="secondaire" taille="compact" onClick={() => onFermer(p)} disabled={occupe}>
                      {occupe ? 'Fermeture…' : "Fermer l'application"}
                    </Bouton>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {ouvertesNonFaites.length > 0 && (
        <p className="text-corps-petit text-secondary">À faire : fermez {noms(ouvertesNonFaites)}, puis vérifiez à nouveau.</p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {logFile && (
          <button
            type="button"
            onClick={onOuvrirRapport}
            className="mr-2 rounded-sm text-libelle text-secondary underline underline-offset-2 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-action-primary-bg"
          >
            Voir le rapport
          </button>
        )}
        <Bouton variante="secondaire" onClick={onVerifier}>Vérifier à nouveau</Bouton>
        <Bouton onClick={onAccueil}>Retour à l'accueil</Bouton>
      </div>
    </div>
  );
}
