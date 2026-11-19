import { Suspense, lazy } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";

// Chaque page est chargée à la demande.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Cleaning  = lazy(() => import("./pages/Cleaning"));
const Repair    = lazy(() => import("./pages/Repair"));
const Applications = lazy(() => import("./pages/Applications"));
const Drivers   = lazy(() => import("./pages/Drivers"));
const Settings  = lazy(() => import("./pages/Settings"));
const NotFound  = lazy(() => import("./pages/NotFound"));

export default function App() {
  return (
    <Suspense fallback={<div className="p-6 text-secondary">Chargement…</div>}>
      <Routes>
        {/* Toutes les pages partagent le même cadre */}
        <Route element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="cleaning" element={<Cleaning />} />
          {/* Onglets Mises à jour et Démarrage (?onglet=demarrage) */}
          <Route path="applications" element={<Applications />} />
          <Route path="drivers"  element={<Drivers />} />
          <Route path="repair"   element={<Repair />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Anciennes adresses */}
        <Route path="updates" element={<Navigate to="/applications" replace />} />
        <Route path="home" element={<Navigate to="/" replace />} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
