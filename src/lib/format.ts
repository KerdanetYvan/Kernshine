import type { Statut } from '../components/ui/Pastille';

const KO = 1024;
const MO = KO * 1024;
const GO = MO * 1024;

const nombre = (valeur: number, decimales: number) =>
  valeur.toLocaleString('fr-FR', { maximumFractionDigits: decimales, minimumFractionDigits: 0 });

/**
 * Taille lisible, à la française : « 850 Mo », « 6,1 Go », « 12,4 Go », « 250 Go ».
 * `arrondi` donne un nombre entier de Go, pour les grands chiffres (« 38 Go »).
 */
export function formatOctets(octets: number, arrondi = false): string {
  if (octets >= GO) return `${nombre(octets / GO, arrondi || octets >= 100 * GO ? 0 : 1)} Go`;
  if (octets >= MO) return `${nombre(octets / MO, 0)} Mo`;
  if (octets >= KO) return `${nombre(octets / KO, 0)} Ko`;
  return `${octets} o`;
}

/** « a », « a et b », « a, b et c » ; au-delà de `max`, « a, b, c et autres ». */
export function formatListe(elements: string[], max = 3): string {
  if (elements.length > max) return `${elements.slice(0, max).join(', ')} et autres`;
  if (elements.length <= 1) return elements[0] ?? '';
  return `${elements.slice(0, -1).join(', ')} et ${elements[elements.length - 1]}`;
}

/** Temps écoulé depuis un instant : « il y a quelques secondes », « il y a 5 min », « il y a 2 h ». */
export function depuis(instant: number, maintenant = Date.now()): string {
  const minutes = Math.floor((maintenant - instant) / 60_000);
  if (minutes < 1) return 'il y a quelques secondes';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  return `il y a ${jours} jour${jours > 1 ? 's' : ''}`;
}

/** Accorde un mot avec un nombre : `pluriel(2, 'application')` → « applications ». */
export function pluriel(n: number, singulier: string, plurielForme = `${singulier}s`): string {
  return n > 1 ? plurielForme : singulier;
}

/**
 * État d'un disque d'après sa place libre : moins de 10 % « À corriger »,
 * moins de 20 % « À surveiller », sinon « Tout va bien ».
 */
export function etatDisque(libres: number, total: number): Statut {
  const part = total > 0 ? libres / total : 1;
  if (part < 0.1) return 'corriger';
  if (part < 0.2) return 'surveiller';
  return 'ok';
}
