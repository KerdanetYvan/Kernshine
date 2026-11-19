import type { ReactNode } from 'react';
import { CheckCircleIcon, InfoIcon, WarningIcon, XIcon } from '@phosphor-icons/react';

export type TypeBandeau = 'info' | 'ok' | 'surveiller' | 'corriger';

const styles: Record<TypeBandeau, { fond: string; icone: string; action: string; Icone: typeof InfoIcon }> = {
  info: { fond: 'bg-status-info-bg', icone: 'text-status-info-fg', action: 'bg-status-info-fg', Icone: InfoIcon },
  ok: { fond: 'bg-status-ok-bg', icone: 'text-status-ok-fg', action: 'bg-status-ok-fg', Icone: CheckCircleIcon },
  surveiller: { fond: 'bg-status-warning-bg', icone: 'text-status-warning-fg', action: 'bg-status-warning-fg', Icone: WarningIcon },
  corriger: { fond: 'bg-status-danger-bg', icone: 'text-status-danger-fg', action: 'bg-status-danger-fg', Icone: WarningIcon },
};

interface BandeauProps {
  type: TypeBandeau;
  children: ReactNode;
  /** Bouton à droite, de la couleur du bandeau (« Libérer de l'espace »). */
  action?: { libelle: string; onClick: () => void };
  /** Affiche une croix pour fermer le bandeau. */
  onFermer?: () => void;
}

/** Message d'information ou d'alerte, en langage clair (Figma : « Bandeau »). */
export default function Bandeau({ type, children, action, onFermer }: BandeauProps) {
  const { fond, icone, action: fondAction, Icone } = styles[type];
  return (
    <div role="status" className={`flex items-center gap-3 rounded-lg p-4 ${fond}`}>
      <Icone className={`size-6 shrink-0 ${icone}`} />
      <p className="min-w-0 flex-1 text-corps text-primary">{children}</p>
      {action && (
        // Texte clair sur toutes les couleurs : le Figma met du texte ardoise sur
        // les fonds foncés de l'information, du vert et de l'ambre (contraste insuffisant).
        <button
          type="button"
          onClick={action.onClick}
          className={`shrink-0 whitespace-nowrap rounded-lg px-5 py-2 text-bouton text-inverse transition-opacity hover:opacity-90 ${fondAction}`}
        >
          {action.libelle}
        </button>
      )}
      {onFermer && (
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer"
          title="Fermer"
          className="grid size-8 shrink-0 place-items-center rounded-sm text-secondary transition-colors hover:bg-surface/60"
        >
          <XIcon className="size-5" />
        </button>
      )}
    </div>
  );
}
