import type { ReactNode } from 'react';
import { GearSixIcon } from '@phosphor-icons/react';
import BoutonRond from './BoutonRond';

interface EnTetePageProps {
  titre: string;
  sousTitre: string;
  /** Éléments avant la roue des réglages (« Dernière vérification… », « Vérifier maintenant »). */
  actions?: ReactNode;
}

/** Titre, sous-titre et accès aux Paramètres, en haut de chaque page (Figma : « Barre de page »). */
export default function EnTetePage({ titre, sousTitre, actions }: EnTetePageProps) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-titre-1 text-primary">{titre}</h1>
        <p className="text-corps text-secondary">{sousTitre}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {actions}
        <BoutonRond libelle="Paramètres" vers="/settings">
          <GearSixIcon className="size-6" />
        </BoutonRond>
      </div>
    </header>
  );
}
