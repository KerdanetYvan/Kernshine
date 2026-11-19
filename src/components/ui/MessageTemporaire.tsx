import { useEffect, useRef } from 'react';
import Bouton from './Bouton';

interface MessageTemporaireProps {
  message: string;
  /** Bouton à droite, le plus souvent « Annuler » pour revenir sur un changement. */
  action?: { libelle: string; onClick: () => void };
  /** Appelé quand le message disparaît tout seul. */
  onFermer: () => void;
  duree?: number;
}

/**
 * Message en bas de la zone de contenu après un changement (Figma : « Message temporaire »).
 * Centré dans la zone de contenu : le décalage vaut la moitié du menu (w-72).
 */
export default function MessageTemporaire({ message, action, onFermer, duree = 6000 }: MessageTemporaireProps) {
  // La page peut recréer onFermer à chaque rendu : on garde la dernière sans relancer le minuteur.
  const fermer = useRef(onFermer);
  useEffect(() => {
    fermer.current = onFermer;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => fermer.current(), duree);
    return () => window.clearTimeout(timer);
  }, [message, duree]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-8 left-[calc(50%+theme(spacing.36))] z-40 flex -translate-x-1/2 items-center gap-6 rounded-lg bg-inverse py-3 pl-6 pr-4"
    >
      <p className="whitespace-nowrap text-corps text-inverse">{message}</p>
      {action && (
        <Bouton variante="secondaire" taille="compact" onClick={action.onClick}>
          {action.libelle}
        </Bouton>
      )}
    </div>
  );
}
