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
