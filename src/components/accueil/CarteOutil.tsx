import type { Icon } from '@phosphor-icons/react';
import Bouton from '../ui/Bouton';
import Carte from '../ui/Carte';

interface CarteOutilProps {
  icone: Icon;
  titre: string;
  texte: string;
  bouton: string;
  onClick: () => void;
}

/** Un outil de « Pour aller plus loin » (Figma : « Carte d'action »). */
export default function CarteOutil({ icone: Icone, titre, texte, bouton, onClick }: CarteOutilProps) {
  return (
    <Carte className="flex flex-col items-start gap-4">
      <div className="grid size-11 place-items-center rounded-md bg-brand-shield-fill">
        <Icone weight="duotone" className="size-6 text-brand-shield-stroke" />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-titre-3 text-primary">{titre}</h3>
        <p className="text-corps-petit text-secondary">{texte}</p>
      </div>
      <Bouton variante="secondaire" taille="compact" onClick={onClick} className="mt-auto">
        {bouton}
      </Bouton>
    </Carte>
  );
}
