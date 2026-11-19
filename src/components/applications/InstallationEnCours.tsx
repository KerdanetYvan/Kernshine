import { ArrowsClockwiseIcon, CheckCircleIcon, CircleIcon, CircleNotchIcon, WarningIcon } from '@phosphor-icons/react';
import type { SoftwareUpdate, SwProgress } from '../../types/commands';
import Bouton from '../ui/Bouton';
import ProgressionCirculaire from '../ui/ProgressionCirculaire';

export type StatutInstallation = Omit<SwProgress, 'id'> & { closeMsg?: string };

interface InstallationEnCoursProps {
  paquets: SoftwareUpdate[];
  statuts: Map<string, StatutInstallation>;
  arretDemande: boolean;
  onArreter: () => void;
}

const termine = (s?: StatutInstallation) => s !== undefined && s.status !== 'installing';

/** Installation des mises à jour, une par une (Figma : « Applications – Mises à jour – En cours »). */
export default function InstallationEnCours({ paquets, statuts, arretDemande, onArreter }: InstallationEnCoursProps) {
  const faits = paquets.filter((p) => termine(statuts.get(p.id))).length;
  const indexCourant = paquets.findIndex((p) => statuts.get(p.id)?.status === 'installing');
  const courant = indexCourant >= 0 ? paquets[indexCourant] : undefined;
  const lent = courant && statuts.get(courant.id)?.slow;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-8 py-4" aria-live="polite">
      <ProgressionCirculaire valeur={paquets.length ? (faits / paquets.length) * 100 : 0} libelle="Mise à jour des applications">
        <ArrowsClockwiseIcon weight="duotone" className="size-12 text-action-primary-bg" />
      </ProgressionCirculaire>

      <div className="flex w-full max-w-[400px] flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-titre text-titre-3 text-primary">
            {courant ? `Mise à jour de ${courant.name}…` : arretDemande ? 'Arrêt en cours…' : 'Préparation…'}
          </p>
          <p className="text-corps text-secondary">
            {courant && `Application ${indexCourant + 1} sur ${paquets.length}. `}
            {lent
              ? "Cette installation est longue, c'est normal pour un gros programme. Windows peut vous demander l'autorisation : regardez la barre des tâches."
              : 'Chaque application est téléchargée puis installée. Vous pouvez continuer à utiliser votre PC.'}
          </p>
        </div>

        <ul className="divide-y rounded-lg border bg-surface">
          {paquets.map((p) => {
            const s = statuts.get(p.id);
            const enCours = s?.status === 'installing';
            const [Icone, couleur, etat] =
              s?.status === 'ok'
                ? [CheckCircleIcon, 'text-status-ok-fg', 'À jour']
                : s?.status === 'error'
                  ? [WarningIcon, 'text-status-warning-fg', 'À reprendre']
                  : s?.status === 'skipped'
                    ? [CircleIcon, 'text-muted', 'Arrêté']
                    : enCours
                      ? [CircleNotchIcon, 'text-action-primary-bg animate-spin', 'En cours…']
                      : [CircleIcon, 'text-muted', 'En attente'];
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Icone className={`size-5 shrink-0 ${couleur}`} />
                <span className={`min-w-0 flex-1 truncate ${s && s.status !== 'skipped' ? 'text-corps-gras text-primary' : 'text-corps text-secondary'}`}>
                  {p.name}
                </span>
                <span className={`text-legende ${s?.status === 'ok' ? 'text-status-ok-fg' : 'text-secondary'}`}>{etat}</span>
              </li>
            );
          })}
        </ul>

        <div>
          <Bouton variante="secondaire" taille="compact" onClick={onArreter} disabled={arretDemande}>
            {arretDemande ? 'Arrêt après celle-ci…' : 'Arrêter'}
          </Bouton>
        </div>
      </div>
    </div>
  );
}
