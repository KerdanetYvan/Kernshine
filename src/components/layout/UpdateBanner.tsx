import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SelfUpdateCheck } from '../../types/commands';
import Bandeau from '../ui/Bandeau';

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
  const navigate = useNavigate();

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
    <Bandeau
      type="info"
      action={{ libelle: 'Voir la mise à jour', onClick: () => navigate('/settings') }}
      onFermer={() => setClosed(true)}
    >
      Une nouvelle version de Kernshine est disponible ({version}).
    </Bandeau>
  );
}
