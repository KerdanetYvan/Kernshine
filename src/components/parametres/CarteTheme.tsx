import { useId } from 'react';

type Theme = 'clair' | 'sombre' | 'automatique';

// Illustration : un aperçu montre un thème précis, il ne suit pas le thème affiché.
// Couleurs reprises des cartes du Figma (« Carte de thème »).
const CLAIR = { fond: '#FDFBF7', menu: '#FFFFFF', trait: '#E3E8F0', titre: '#24304A', carte: '#FFFFFF', bord: '#E3E8F0', action: '#7461B0' };
const SOMBRE = { fond: '#171C28', menu: '#1F2635', trait: '#2C3547', titre: '#E2E8F0', carte: '#1F2635', bord: '#2C3547', action: '#A48BDB' };

function Apercu({ c }: { c: typeof CLAIR }) {
  return (
    <>
      <rect width="304" height="112" fill={c.fond} />
      <rect width="64" height="112" fill={c.menu} />
      {[14, 32, 50].map((y) => <rect key={y} x="12" y={y} width="40" height="8" rx="4" fill={c.trait} />)}
      <rect x="80" y="14" width="96" height="10" rx="5" fill={c.titre} />
      <rect x="80.5" y="36.5" width="207" height="33" rx="8" fill={c.carte} stroke={c.bord} />
      <rect x="92" y="46" width="70" height="6" rx="3" fill={c.trait} />
      <rect x="92" y="58" width="44" height="6" rx="3" fill={c.trait} />
      <rect x="244" y="48" width="36" height="14" rx="7" fill={c.action} />
      <rect x="80" y="82" width="208" height="8" rx="4" fill={c.trait} />
    </>
  );
}

const noms: Record<Theme, string> = { clair: 'Clair', sombre: 'Sombre', automatique: 'Automatique' };

interface CarteThemeProps {
  theme: Theme;
  choisi: boolean;
  /** Thème pas encore disponible : la carte est grisée. */
  bientot?: boolean;
  onChoisir: () => void;
}

/** Choix d'un thème, avec son aperçu (Figma : « Carte de thème »). */
export default function CarteTheme({ theme, choisi, bientot = false, onChoisir }: CarteThemeProps) {
  const decoupe = `moitie-sombre-${useId().replace(/:/g, '')}`;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={choisi}
      disabled={bientot}
      onClick={onChoisir}
      className={[
        'flex min-w-0 flex-1 flex-col gap-3.5 rounded-lg bg-surface p-4 text-left transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-bg',
        choisi ? 'border-2 border-action-primary-bg' : 'border hover:border-strong',
        bientot ? 'cursor-not-allowed opacity-60' : '',
      ].join(' ')}
    >
      <svg viewBox="0 0 304 112" className="w-full rounded-md" aria-hidden="true">
        <Apercu c={theme === 'sombre' ? SOMBRE : CLAIR} />
        {theme === 'automatique' && (
          <>
            <defs>
              <clipPath id={decoupe}><rect x="152" width="152" height="112" /></clipPath>
            </defs>
            <g clipPath={`url(#${decoupe})`}><Apercu c={SOMBRE} /></g>
          </>
        )}
      </svg>
      <span className="flex items-center gap-2.5">
        <span className={`grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${choisi ? 'border-action-primary-bg' : 'border-strong'}`}>
          {choisi && <span className="size-2.5 rounded-full bg-action-primary-bg" />}
        </span>
        <span className="text-corps-gras text-primary">{noms[theme]}</span>
        {theme === 'automatique' && <span className="text-corps-petit text-secondary">selon Windows</span>}
        {bientot && <span className="ml-auto text-legende text-secondary">Bientôt</span>}
      </span>
    </button>
  );
}
