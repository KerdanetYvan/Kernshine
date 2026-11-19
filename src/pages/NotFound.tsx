import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="grid h-screen place-items-center bg-page">
      <div className="space-y-2 text-center">
        <h1 className="text-titre-1 text-primary">Page introuvable</h1>
        <p className="text-corps text-secondary">Cette page n'existe pas ou a changé de place.</p>
        <Link to="/" className="text-libelle text-action-primary-bg underline underline-offset-2">
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
