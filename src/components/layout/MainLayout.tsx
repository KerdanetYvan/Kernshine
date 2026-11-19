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
          {/* Pas de largeur maximale : comme dans les maquettes, le contenu remplit la zone. */}
          <div className="flex min-h-full flex-col gap-8 p-12">
            <UpdateBanner />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
