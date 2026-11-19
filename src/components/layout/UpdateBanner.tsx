import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link, useLocation } from 'react-router-dom';
import { SparkleIcon, XIcon } from '@phosphor-icons/react';
import type { SelfUpdateCheck } from '../../types/commands';

/** Laisse l'app démarrer et les premières analyses partir avant de vérifier. */
const DELAI_MS = 5000;

/**
 * Bandeau discret au démarrage quand une nouvelle version de Kernshine existe.
 * Silencieux sans mise à jour ou sans internet ; rien n'est installé d'ici,
 * il renvoie vers les Paramètres où l'utilisateur décide.
 */
export default function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      invoke<SelfUpdateCheck>('selfupdate_check')
        .then((res) => {
          if (!cancelled && res.ok && res.available && res.version) setVersion(res.version);
        })
        .catch(() => {});
    }, DELAI_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!version || closed || pathname === '/settings') return null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border bg-status-info-bg px-4 py-3 text-status-info-fg">
      <SparkleIcon weight="duotone" className="h-5 w-5 flex-shrink-0" />
      <p className="flex-1 text-corps-petit">
        Une nouvelle version de Kernshine est disponible ({version}).
      </p>
      <Link to="/settings" className="text-libelle underline underline-offset-2">
        Voir la mise à jour
      </Link>
      <button onClick={() => setClosed(true)} aria-label="Plus tard" title="Plus tard" className="rounded-sm p-1">
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
