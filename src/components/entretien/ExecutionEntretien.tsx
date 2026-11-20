import { CheckCircleIcon, CircleIcon, CircleNotchIcon, WarningIcon, type Icon } from '@phosphor-icons/react';
import ProgressionCirculaire from '../ui/ProgressionCirculaire';
import type { StatutElement } from './donnees';

export interface ElementEnCours {
  cle: string;
  nom: string;
  statut: StatutElement;
}

interface ExecutionEntretienProps {
  icone: Icon;
  /** 0 à 100, ou absent quand l'avancement n'est pas mesurable. */
  valeur?: number;
  titre: string;
  detail: string;
  /** Éléments de l'étape en cours (applications, pilotes…), avec leur état. */
  elements: ElementEnCours[];
}

const ETATS: Record<StatutElement, [Icon, string, string]> = {
  ok: [CheckCircleIcon, 'text-status-ok-fg', 'Terminé'],
  echec: [WarningIcon, 'text-status-warning-fg', 'À reprendre'],
  saute: [CircleIcon, 'text-muted', 'Arrêté'],
  encours: [CircleNotchIcon, 'animate-spin text-action-primary-bg', 'En cours…'],
  attente: [CircleIcon, 'text-muted', 'En attente'],
};

/** Une étape de l'entretien en train de se faire (Figma : « Entretien – … en cours »). */
export default function ExecutionEntretien({ icone: Icone, valeur, titre, detail, elements }: ExecutionEntretienProps) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-16 gap-y-8 py-6 ${elements.length === 0 ? 'flex-col text-center' : ''}`} aria-live="polite">
      <ProgressionCirculaire valeur={valeur} libelle={titre}>
        {valeur !== undefined && elements.length === 0 ? (
          <span className="font-titre text-chiffre text-primary">{Math.round(valeur)} %</span>
        ) : (
          <Icone weight="duotone" className="size-12 text-action-primary-bg" />
        )}
      </ProgressionCirculaire>
      <div className={`flex w-full flex-col gap-4 ${elements.length > 0 ? 'max-w-[440px]' : 'max-w-[640px] items-center'}`}>
        <div className="flex flex-col gap-1">
          <p className="font-titre text-titre-3 text-primary">{titre}</p>
          <p className="text-corps text-secondary">{detail}</p>
        </div>
        {elements.length > 0 && (
          <ul className="divide-y rounded-lg border bg-surface">
            {elements.map((e) => {
              const [I, couleur, libelle] = ETATS[e.statut];
              return (
                <li key={e.cle} className="flex items-center gap-3 px-4 py-3">
                  <I className={`size-5 shrink-0 ${couleur}`} />
                  <span className={`min-w-0 flex-1 truncate ${e.statut === 'attente' || e.statut === 'saute' ? 'text-corps text-secondary' : 'text-corps-gras text-primary'}`}>{e.nom}</span>
                  <span className={`text-legende ${e.statut === 'ok' ? 'text-status-ok-fg' : 'text-secondary'}`}>{libelle}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
