import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Prefs } from '../types/commands';

/** Réglages par défaut, le temps de lire le fichier (les mêmes que côté Rust). */
export const PREFS_PAR_DEFAUT: Prefs = {
  autoUpdate: false,
  restoreBeforeDrivers: true,
  largeFileMinMb: 500,
  maintenanceCleaning: true,
  maintenanceBigfiles: true,
  maintenanceApps: true,
  maintenanceDrivers: true,
};

/**
 * Préférences de l'utilisateur, lues au chargement. `changer` enregistre tout de suite ;
 * en cas d'échec, le réglage revient à sa valeur et `erreur` l'explique.
 */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(PREFS_PAR_DEFAUT);
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Valeur courante, lisible tout de suite (l'état React n'est à jour qu'au rendu suivant).
  const courant = useRef<Prefs>(PREFS_PAR_DEFAUT);

  useEffect(() => {
    invoke<Prefs>('settings_get_prefs')
      .then((p) => {
        courant.current = p;
        setPrefs(p);
      })
      .catch(() => {})
      .finally(() => setPret(true));
  }, []);

  const changer = useCallback(async (modif: Partial<Prefs>) => {
    const avant = courant.current;
    const apres = { ...avant, ...modif };
    courant.current = apres;
    setPrefs(apres);
    try {
      await invoke<Prefs>('settings_set_prefs', { prefs: apres });
      setErreur(null);
    } catch (e) {
      courant.current = avant;
      setPrefs(avant);
      setErreur(typeof e === 'string' ? e : "Le réglage n'a pas pu être enregistré. Réessayez.");
    }
  }, []);

  return { prefs, pret, changer, erreur };
}
