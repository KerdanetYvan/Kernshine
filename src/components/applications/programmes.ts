import { Channel, invoke } from '@tauri-apps/api/core';
import type { InstalledProgram, MeasuredSize, ProgramList } from '../../types/commands';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « Microsoft · Installé en mars 2025 » */
export function detailProgramme(p: InstalledProgram): string {
  const parties: string[] = [];
  if (p.publisher) parties.push(p.publisher);
  if (p.installed) {
    const [annee, mois] = p.installed.split('-').map(Number);
    if (annee && mois >= 1 && mois <= 12) parties.push(`Installé en ${MOIS[mois - 1]} ${annee}`);
  }
  return parties.join(' · ');
}

/** Pour chercher sans tenir compte des majuscules ni des accents. */
export const normaliser = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export type Tri = 'taille' | 'nom';

/** Les tailles inconnues (ou pas encore mesurées) passent en dernier. */
export function trier(programmes: InstalledProgram[], tri: Tri): InstalledProgram[] {
  const parNom = (a: InstalledProgram, b: InstalledProgram) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
  return [...programmes].sort(tri === 'nom' ? parNom : (a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1) || parNom(a, b));
}

/**
 * Liste gardée tant que Kernshine est ouvert, avec les tailles mesurées par Kernshine
 * (la mesure continue même si l'utilisateur change d'onglet).
 */
export const memoireProgrammes: {
  liste: ProgramList | null;
  /** Tailles mesurées : `null` quand le dossier n'a pas pu l'être. */
  tailles: Map<string, number | null>;
  mesureEnCours: boolean;
  abonnes: Set<() => void>;
} = { liste: null, tailles: new Map(), mesureEnCours: false, abonnes: new Set() };

const prevenir = () => memoireProgrammes.abonnes.forEach((f) => f());

/** Programme avec sa taille mesurée, si Windows ne la connaissait pas. */
export function avecTaille(p: InstalledProgram): InstalledProgram {
  if (!p.measuring) return p;
  const mesuree = memoireProgrammes.tailles.get(p.id);
  if (mesuree === undefined) return p;
  return { ...p, sizeBytes: mesuree, measuring: false };
}

/** Relit la liste des programmes, puis mesure en arrière-plan les tailles encore inconnues. */
export async function chargerProgrammes(): Promise<ProgramList> {
  const liste = await invoke<ProgramList>('uninstall_get');
  memoireProgrammes.liste = liste;
  const aMesurer = liste.programs.some((p) => p.measuring && !memoireProgrammes.tailles.has(p.id));
  if (aMesurer) {
    mesures++;
    memoireProgrammes.mesureEnCours = true;
    const canal = new Channel<MeasuredSize>();
    canal.onmessage = (m) => {
      memoireProgrammes.tailles.set(m.id, m.sizeBytes);
      prevenir();
    };
    invoke('uninstall_sizes', { known: [...memoireProgrammes.tailles.keys()], onSize: canal })
      .catch((e) => console.warn('tailles des programmes', e))
      .finally(() => {
        mesures--;
        memoireProgrammes.mesureEnCours = mesures > 0;
        prevenir();
      });
  }
  prevenir();
  return liste;
}

/** Mesures lancées et pas encore finies (une nouvelle lecture peut en lancer une autre). */
let mesures = 0;
