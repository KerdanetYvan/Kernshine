import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import Cadran from './Cadran';

interface BoutonScanProps {
  libelle: string;
  onClick: () => void;
}

/** Grand bouton rond qui lance une analyse (Figma : « Bouton de scan »). */
export default function BoutonScan({ libelle, onClick }: BoutonScanProps) {
  return (
    <Cadran plein>
      <button
        type="button"
        onClick={onClick}
        className={[
          'absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-full transition-colors',
          // Reflet : un dégradé blanc en haut du disque.
          'bg-gradient-to-b from-action-primary-fg/30 to-transparent to-60% hover:from-action-primary-fg/40',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-action-primary-bg',
        ].join(' ')}
      >
        <MagnifyingGlassIcon className="size-12 text-action-primary-fg" />
        <span className="w-[136px] text-center font-titre text-titre-3 text-action-primary-fg">{libelle}</span>
      </button>
    </Cadran>
  );
}
