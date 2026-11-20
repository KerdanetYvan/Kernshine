import { useEffect, type ReactNode } from 'react';
import Bouton from '../ui/Bouton';
import FriseEtapes from './FriseEtapes';
import type { Etape, SuiviEtape } from './etapes';

interface FenetreEntretienProps {
  titre: string;
  sousTitre: string;
  /** Bouton en haut à droite : Annuler, Arrêter ou Fermer. */
  action: { libelle: string; onClick: () => void; disabled?: boolean };
  suivi: Record<Etape, SuiviEtape>;
  /** Bas de fenêtre, collé (récapitulatif, conseil pendant l'entretien…). */
  pied?: ReactNode;
  children: ReactNode;
}

/** Grande fenêtre de l'entretien, par-dessus l'Accueil (Figma : écrans « Entretien – … »). */
export default function FenetreEntretien({ titre, sousTitre, action, suivi, pied, children }: FenetreEntretienProps) {
  // Pas de défilement de la page derrière la fenêtre.
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = avant;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-inverse/45 p-8" role="dialog" aria-modal="true" aria-label={titre}>
      <div className="flex max-h-full w-full max-w-[1340px] flex-col overflow-hidden rounded-xl bg-surface shadow-fenetre">
        <header className="flex flex-col gap-6 border-b px-10 pb-6 pt-8">
          <div className="flex items-start gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h1 className="text-titre-1 text-primary">{titre}</h1>
              <p className="text-corps text-secondary">{sousTitre}</p>
            </div>
            <Bouton variante="secondaire" onClick={action.onClick} disabled={action.disabled}>{action.libelle}</Bouton>
          </div>
          <FriseEtapes suivi={suivi} />
        </header>
        <div className="min-h-[360px] flex-1 overflow-y-auto bg-page px-10 py-6">{children}</div>
        {pied && <footer className="flex min-h-[88px] items-center gap-4 border-t px-10 py-4">{pied}</footer>}
      </div>
    </div>
  );
}
