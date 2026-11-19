import { useEffect, type ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import Bouton from './Bouton';
import Pastille from './Pastille';

interface FenetreConfirmationProps {
  /** Icône Phosphor au centre du halo (affichée en duotone). */
  icone: Icon;
  titre: string;
  texte: string;
  /** Grand chiffre au-dessus du titre (« 32,8 Go »). */
  chiffre?: string;
  /** Visuel du récapitulatif (anneau, barres de fichiers…), fourni par la page. */
  children?: ReactNode;
  /** Action risquée : halo et bouton rouges. */
  danger?: boolean;
  /** Mention « Définitif · impossible à annuler » (par défaut avec `danger`). */
  definitif?: boolean;
  libelleConfirmer: string;
  onConfirmer: () => void;
  onAnnuler: () => void;
}

/**
 * Demande l'accord de l'utilisateur avant une action (Figma : « Fenêtre de confirmation »).
 * Kernshine ne fait rien d'irréversible sans ce clic. Échap ou un clic sur le voile annulent.
 */
export default function FenetreConfirmation({
  icone: Icone, titre, texte, chiffre, children, danger = false, definitif = danger, libelleConfirmer, onConfirmer, onAnnuler,
}: FenetreConfirmationProps) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onAnnuler();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onAnnuler]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-inverse/45" onClick={onAnnuler} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fenetre-titre"
        aria-describedby="fenetre-texte"
        className="relative flex max-h-full w-[624px] max-w-full flex-col items-center gap-4 overflow-y-auto rounded-xl bg-surface px-8 pb-8 pt-9 shadow-fenetre"
      >
        {/* Halo : anneau à 20 %, disque teinté à 10 %, disque blanc et l'icône. */}
        <div className={`grid size-[120px] shrink-0 place-items-center rounded-full border-[1.5px] ${danger ? 'border-status-danger-fg/20' : 'border-action-primary-bg/20'}`}>
          <div className={`grid size-24 place-items-center rounded-full ${danger ? 'bg-status-danger-fg/10' : 'bg-action-primary-bg/10'}`}>
            <div className="grid size-[72px] place-items-center rounded-full bg-surface shadow-disque">
              <Icone weight="duotone" className="size-9 text-secondary" />
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-1.5 text-center">
          {chiffre && <p className="font-titre text-chiffre text-primary">{chiffre}</p>}
          <h2 id="fenetre-titre" className="text-titre-2 text-primary">{titre}</h2>
          <p id="fenetre-texte" className="text-corps text-secondary">{texte}</p>
        </div>

        {definitif && <Pastille statut="corriger">Définitif · impossible à annuler</Pastille>}

        {children && <div className="w-full">{children}</div>}

        <div className="flex w-full justify-center gap-3">
          {/* Le focus va sur « Annuler » : la touche Entrée ne lance rien par mégarde. */}
          <Bouton variante="secondaire" onClick={onAnnuler} autoFocus>
            Annuler
          </Bouton>
          <Bouton variante={danger ? 'danger' : 'principal'} onClick={onConfirmer}>
            {libelleConfirmer}
          </Bouton>
        </div>
      </div>
    </div>
  );
}
