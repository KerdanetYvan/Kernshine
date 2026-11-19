import { useEffect, useState } from 'react';
import { Channel, invoke } from '@tauri-apps/api/core';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Prefs, SelfUpdateCheck, SelfUpdateEvent, SelfUpdateResult } from '../../types/commands';
import Bandeau from '../ui/Bandeau';

/** Laisse l'app démarrer et les premières analyses partir avant de vérifier. */
const DELAI_MS = 5000;

type Etat =
  | { kind: 'rien' }
  | { kind: 'disponible'; version: string }
  /** Mises à jour automatiques activées : l'installation est en cours. */
  | { kind: 'installation'; version: string }
  | { kind: 'echec'; version: string };

/**
 * Au démarrage, quand une nouvelle version de Kernshine existe :
 * - par défaut, un bandeau discret renvoie vers les Paramètres, où l'utilisateur décide ;
 * - si les mises à jour automatiques sont activées, Kernshine l'installe et redémarre.
 * Silencieux sans mise à jour ou sans internet.
 */
export default function UpdateBanner() {
  const [etat, setEtat] = useState<Etat>({ kind: 'rien' });
  const [ferme, setFerme] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let annule = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await invoke<SelfUpdateCheck>('selfupdate_check');
        if (annule || !res.ok || !res.available || !res.version) return;
        const version = res.version;
        const prefs = await invoke<Prefs>('settings_get_prefs').catch(() => null);
        if (!prefs?.autoUpdate) {
          setEtat({ kind: 'disponible', version });
          return;
        }
        setEtat({ kind: 'installation', version });
        const canal = new Channel<SelfUpdateEvent>();
        // Si tout va bien, l'installeur démarre et Kernshine se ferme avant la réponse.
        const fin = await invoke<SelfUpdateResult>('selfupdate_install', { onEvent: canal });
        if (!annule && !fin.ok) setEtat({ kind: 'echec', version });
      } catch {
        // Pas de connexion ou service indisponible : on réessaiera au prochain démarrage.
      }
    }, DELAI_MS);
    return () => {
      annule = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (etat.kind === 'rien' || ferme) return null;

  if (etat.kind === 'installation') {
    return (
      <Bandeau type="info">
        Installation de la version {etat.version} de Kernshine… Il va se fermer puis redémarrer tout seul.
      </Bandeau>
    );
  }

  // Dans les Paramètres, la ligne « Version de Kernshine » donne déjà l'information.
  if (pathname === '/settings') return null;

  return (
    <Bandeau
      type={etat.kind === 'echec' ? 'surveiller' : 'info'}
      action={{ libelle: 'Voir la mise à jour', onClick: () => navigate('/settings') }}
      onFermer={() => setFerme(true)}
    >
      {etat.kind === 'echec'
        ? `La version ${etat.version} de Kernshine n'a pas pu s'installer toute seule.`
        : `Une nouvelle version de Kernshine est disponible (${etat.version}).`}
    </Bandeau>
  );
}
