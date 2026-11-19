import { CheckCircleIcon, CircleIcon, CircleNotchIcon, TrashIcon, WarningIcon } from '@phosphor-icons/react';
import type { InstalledProgram, UninstallProgress } from '../../types/commands';
import Bouton from '../ui/Bouton';
import ProgressionCirculaire from '../ui/ProgressionCirculaire';

interface DesinstallationEnCoursProps {
  programmes: InstalledProgram[];
  statuts: Map<string, UninstallProgress['status']>;
  arretDemande: boolean;
  onArreter: () => void;
}

/** Désinstallation, un programme à la fois (Figma : « Applications – Désinstallation – Désinstallation en cours »). */
export default function DesinstallationEnCours({ programmes, statuts, arretDemande, onArreter }: DesinstallationEnCoursProps) {
  const faits = programmes.filter((p) => {
    const s = statuts.get(p.id);
    return s !== undefined && s !== 'running';
  }).length;
  const indexCourant = programmes.findIndex((p) => statuts.get(p.id) === 'running');
  const courant = indexCourant >= 0 ? programmes[indexCourant] : undefined;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-8 py-4" aria-live="polite">
      <ProgressionCirculaire valeur={programmes.length ? (faits / programmes.length) * 100 : 0} libelle="Désinstallation des programmes">
        <TrashIcon weight="duotone" className="size-12 text-action-primary-bg" />
      </ProgressionCirculaire>

      <div className="flex w-full max-w-[400px] flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-titre text-titre-3 text-primary">
            {courant ? `Désinstallation de ${courant.name}…` : arretDemande ? 'Arrêt en cours…' : 'Préparation…'}
          </p>
          <p className="text-corps text-secondary">
            {courant && `Programme ${indexCourant + 1} sur ${programmes.length}. `}
            Certains programmes ouvrent leur propre fenêtre : suivez-la si besoin. Windows peut aussi vous demander l'autorisation.
          </p>
        </div>

        <ul className="divide-y rounded-lg border bg-surface">
          {programmes.map((p) => {
            const s = statuts.get(p.id);
            const [Icone, couleur, etat] =
              s === 'removed'
                ? [CheckCircleIcon, 'text-status-ok-fg', 'Désinstallé']
                : s === 'skipped'
                  ? [CircleIcon, 'text-muted', 'Arrêté']
                  : s === 'running'
                    ? [CircleNotchIcon, 'text-action-primary-bg animate-spin', 'En cours…']
                    : s
                      ? [WarningIcon, 'text-status-warning-fg', 'Pas désinstallé']
                      : [CircleIcon, 'text-muted', 'En attente'];
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Icone className={`size-5 shrink-0 ${couleur}`} />
                <span className={`min-w-0 flex-1 truncate ${s && s !== 'skipped' ? 'text-corps-gras text-primary' : 'text-corps text-secondary'}`}>
                  {p.name}
                </span>
                <span className={`text-legende ${s === 'removed' ? 'text-status-ok-fg' : 'text-secondary'}`}>{etat}</span>
              </li>
            );
          })}
        </ul>

        <div>
          <Bouton variante="secondaire" taille="compact" onClick={onArreter} disabled={arretDemande}>
            {arretDemande ? 'Arrêt après celui-ci…' : 'Arrêter'}
          </Bouton>
        </div>
      </div>
    </div>
  );
}
