import { invoke } from '@tauri-apps/api/core';
import type { BigFile } from '../../types/commands';
import { emplacement } from './fichiers';

interface LienEmplacementProps {
  fichier: BigFile;
  /** Message simple si l'Explorateur ne s'ouvre pas (fichier déplacé…). */
  onErreur: (message: string) => void;
}

/** Emplacement d'un gros fichier, cliquable : ouvre l'Explorateur avec le fichier sélectionné. */
export default function LienEmplacement({ fichier, onErreur }: LienEmplacementProps) {
  return (
    <button
      type="button"
      title="Ouvrir l'emplacement dans l'Explorateur"
      onClick={() =>
        invoke('bigfiles_reveal', { id: fichier.id }).catch((e) =>
          onErreur(typeof e === 'string' ? e : "L'Explorateur n'a pas pu s'ouvrir. Réessayez."),
        )
      }
      className="min-w-0 truncate rounded-sm text-left underline underline-offset-2 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-action-primary-bg"
    >
      {emplacement(fichier)}
    </button>
  );
}
