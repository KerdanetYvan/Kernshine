import { Outlet } from 'react-router-dom';
import BarreDeTitre from './BarreDeTitre';
import Navigation from './Navigation';
import UpdateBanner from './UpdateBanner';

/** Cadre de l'application : barre de titre, menu à gauche, page à droite (seule à défiler). */
export default function MainLayout() {
  return (
    <div className="flex h-screen w-screen select-none flex-col overflow-hidden">
      <BarreDeTitre />
      <div className="flex min-h-0 flex-1">
        <Navigation />
        <main className="flex-1 overflow-auto bg-page">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 p-12">
            <UpdateBanner />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
