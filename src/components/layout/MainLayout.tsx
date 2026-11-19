import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { NavLink, Outlet } from 'react-router-dom';
import { ArrowsClockwiseIcon, BroomIcon, GearSixIcon, HouseIcon, MinusIcon, SquareIcon, WrenchIcon, XIcon } from '@phosphor-icons/react';
// Sous 32 px, la charte demande la version simplifiée du logo.
import logo from '../../assets/logo/kernshine-mark-simplifie.svg';
import UpdateBanner from './UpdateBanner';

const appWindow = getCurrentWindow();

const nav = [
  { to: '/',          label: 'Dashboard',    icon: HouseIcon    },
  { to: '/cleaning',  label: 'Nettoyage',    icon: BroomIcon    },
  { to: '/repair',    label: 'Réparation',   icon: WrenchIcon   },
  { to: '/updates',   label: 'Mises à jour', icon: ArrowsClockwiseIcon },
  { to: '/settings',  label: 'Paramètres',   icon: GearSixIcon },
];

export default function MainLayout() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const check = async () => setMaximized(await appWindow.isMaximized());
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col select-none overflow-hidden">

      {/* ── Barre de titre ── */}
      <header data-tauri-drag-region className="drag-region flex items-center h-10 bg-neutral-900 text-white flex-shrink-0">
        {/* Logo + nom */}
        <div className="flex items-center gap-2 px-4 pointer-events-none">
          <img src={logo} alt="" className="h-4 w-4" />
          <span className="text-sm font-semibold tracking-wide">Kernshine</span>
        </div>

        {/* Zone extensible (draggable) */}
        <div data-tauri-drag-region className="flex-1" />

        {/* Boutons fenêtre */}
        <div className="no-drag-region flex h-full">
          <button
            onClick={() => appWindow.minimize()}
            className="flex items-center justify-center w-11 h-full hover:bg-neutral-700 transition-colors"
            aria-label="Réduire"
          >
            <MinusIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => appWindow.toggleMaximize()}
            className="flex items-center justify-center w-11 h-full hover:bg-neutral-700 transition-colors"
            aria-label={maximized ? 'Restaurer' : 'Agrandir'}
          >
            <SquareIcon className="h-3 w-3" />
          </button>
          <button
            onClick={() => appWindow.close()}
            className="flex items-center justify-center w-11 h-full hover:bg-red-500 transition-colors"
            aria-label="Fermer"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* ── Corps principal ── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-52 flex-shrink-0 flex flex-col bg-white border-r border-neutral-200">
          <nav className="flex-1 p-3">
            <ul className="space-y-0.5">
              {nav.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      [
                        'flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-neutral-900 text-white'
                          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                      ].join(' ')
                    }
                  >
                    <Icon weight="duotone" className="h-4 w-4 flex-shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Zone de contenu */}
        <main className="flex-1 overflow-auto bg-page">
          <div className="max-w-5xl mx-auto p-6">
            <UpdateBanner />
            <Outlet />
          </div>
        </main>

      </div>
    </div>
  );
}
