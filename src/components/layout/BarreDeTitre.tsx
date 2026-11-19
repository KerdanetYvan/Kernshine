import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CopyIcon, MinusIcon, SquareIcon, XIcon } from '@phosphor-icons/react';
// Sous 32 px, la charte demande la version simplifiée du logo.
import logo from '../../assets/logo/kernshine-mark-simplifie.svg';

const appWindow = getCurrentWindow();

const controle =
  'grid h-10 w-12 place-items-center text-secondary transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-action-primary-bg';

/** Barre de 40 px qui remplace le cadre de Windows : on la glisse pour déplacer la fenêtre. */
export default function BarreDeTitre() {
  const [agrandie, setAgrandie] = useState(false);

  useEffect(() => {
    const verifier = async () => setAgrandie(await appWindow.isMaximized());
    verifier();
    window.addEventListener('resize', verifier);
    return () => window.removeEventListener('resize', verifier);
  }, []);

  return (
    <header data-tauri-drag-region className="drag-region flex h-10 shrink-0 items-center justify-between border-b bg-surface pl-4">
      <div className="pointer-events-none flex items-center gap-2">
        <img src={logo} alt="" className="size-5" />
        <span className="text-legende text-secondary">Kernshine</span>
      </div>

      <div className="no-drag-region flex">
        <button type="button" onClick={() => appWindow.minimize()} aria-label="Réduire" title="Réduire" className={`${controle} hover:bg-subtle`}>
          <MinusIcon className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => appWindow.toggleMaximize()}
          aria-label={agrandie ? 'Restaurer' : 'Agrandir'}
          title={agrandie ? 'Restaurer' : 'Agrandir'}
          className={`${controle} hover:bg-subtle`}
        >
          {agrandie ? <CopyIcon className="size-5 -scale-x-100" /> : <SquareIcon className="size-5" />}
        </button>
        <button
          type="button"
          onClick={() => appWindow.close()}
          aria-label="Fermer"
          title="Fermer"
          className={`${controle} hover:bg-status-danger-fg hover:text-inverse`}
        >
          <XIcon className="size-5" />
        </button>
      </div>
    </header>
  );
}
