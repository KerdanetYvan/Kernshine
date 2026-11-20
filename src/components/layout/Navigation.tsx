import { NavLink } from 'react-router-dom';
import { CpuIcon, HeartbeatIcon, HouseIcon, SquaresFourIcon, TrashIcon, WrenchIcon, type Icon } from '@phosphor-icons/react';

interface Rubrique {
  vers: string;
  libelle: string;
  icone: Icon;
  /** Rubrique des maquettes dont la page n'existe pas encore : masquée en attendant. */
  bientot?: boolean;
}

/** Le menu des maquettes, plus Réparation (gardée en plus, validée dans le Figma). */
const rubriques: Rubrique[] = [
  { vers: '/', libelle: 'Accueil', icone: HouseIcon },
  { vers: '/cleaning', libelle: 'Nettoyage', icone: TrashIcon },
  { vers: '/applications', libelle: 'Applications', icone: SquaresFourIcon },
  { vers: '/drivers', libelle: 'Pilotes', icone: CpuIcon },
  { vers: '/health', libelle: 'Santé', icone: HeartbeatIcon },
  { vers: '/repair', libelle: 'Réparation', icone: WrenchIcon },
];

/** Menu latéral de 288 px (Figma : « Navigation » et « Élément de navigation »). */
export default function Navigation() {
  return (
    <nav aria-label="Menu principal" className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-r bg-surface p-6">
      {rubriques
        .filter((r) => !r.bientot)
        .map(({ vers, libelle, icone: Icone }) => (
          <NavLink
            key={vers}
            to={vers}
            end={vers === '/'}
            className={({ isActive }) =>
              [
                'flex h-[52px] shrink-0 items-center gap-3 rounded-md px-4 transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-bg',
                isActive ? 'bg-brand-shield-fill text-corps-gras text-primary' : 'text-corps text-secondary hover:bg-subtle hover:text-primary',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icone weight="duotone" className={`size-6 shrink-0 ${isActive ? 'text-brand-shield-stroke' : ''}`} />
                {libelle}
              </>
            )}
          </NavLink>
        ))}
    </nav>
  );
}
