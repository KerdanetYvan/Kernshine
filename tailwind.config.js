/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

// Charte Kernshine : valeurs de la page « Fondations » du Figma.
// Les couleurs sont des variables CSS (src/index.css) : le thème sombre n'aura
// qu'à redéfinir les variables. Chaque classe reprend le nom de la variable
// Figma : `color/bg/page` → `bg-page`, `color/status/ok-fg` → `text-status-ok-fg`.
const c = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

// Styles de texte Figma : [taille, { interligne, espacement des lettres, graisse }].
// Les espacements de lettres de Figma sont en % de la taille (1 % = 0.01em).
const texte = (size, lineHeight, fontWeight, letterSpacing = '0') => [
  `${size / 16}rem`,
  { lineHeight: `${lineHeight / 16}rem`, letterSpacing, fontWeight },
];

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Thème clair uniquement pour l'instant : le sombre ne s'active jamais tout seul.
  darkMode: 'class',
  theme: {
    extend: {
      // Fonds : bg-page, bg-surface, bg-subtle, bg-neutre, bg-inverse
      backgroundColor: {
        page: c('bg-page'),
        surface: c('bg-surface'),
        subtle: c('bg-subtle'),
        // bg/neutral : « neutre » pour ne pas écraser la palette neutral de Tailwind.
        neutre: c('bg-neutral'),
        inverse: c('bg-inverse'),
        // Pistes (barre de progression, pastille « Jamais analysé », interrupteur
        // désactivé) : le Figma y met les couleurs des bordures.
        piste: c('border-default'),
        'piste-forte': c('border-strong'),
      },
      // Textes : text-primary, text-secondary, text-muted, text-inverse, text-accent
      textColor: {
        primary: c('text-primary'),
        secondary: c('text-secondary'),
        muted: c('text-muted'),
        inverse: c('text-inverse'),
        accent: c('text-accent'),
      },
      // Bordures : `border` seul prend border/default ; border-strong
      borderColor: {
        DEFAULT: c('border-default'),
        default: c('border-default'),
        strong: c('border-strong'),
      },
      // Utilisables partout (bg-, text-, border-, fill-…)
      colors: {
        brand: {
          accent: c('brand-accent'),
          'on-accent': c('brand-on-accent'),
          'shield-fill': c('brand-shield-fill'),
          'shield-stroke': c('brand-shield-stroke'),
        },
        action: {
          'primary-bg': c('action-primary-bg'),
          'primary-fg': c('action-primary-fg'),
        },
        status: {
          'ok-fg': c('status-ok-fg'),
          'ok-bg': c('status-ok-bg'),
          'warning-fg': c('status-warning-fg'),
          'warning-bg': c('status-warning-bg'),
          'danger-fg': c('status-danger-fg'),
          'danger-bg': c('status-danger-bg'),
          'info-fg': c('status-info-fg'),
          'info-bg': c('status-info-bg'),
        },
      },
      fontFamily: {
        sans: ['"Manrope Variable"', ...defaultTheme.fontFamily.sans],
        titre: ['"Sora Variable"', ...defaultTheme.fontFamily.sans],
      },
      // Avec font-titre (Sora) : chiffre-grand, chiffre, display, titre-1, titre-2, titre-3.
      // Avec la police par défaut (Manrope) : le reste.
      fontSize: {
        'chiffre-grand': texte(88, 96, '800', '-0.02em'),
        chiffre: texte(40, 48, '800', '-0.02em'),
        display: texte(40, 48, '800', '-0.02em'),
        'titre-1': texte(30, 38, '700', '-0.02em'),
        'titre-2': texte(24, 32, '700', '-0.01em'),
        'titre-3': texte(20, 28, '600'),
        'corps-grand': texte(18, 28, '500'),
        corps: texte(16, 24, '500'),
        'corps-gras': texte(16, 24, '700'),
        'corps-petit': texte(14, 20, '500'),
        bouton: texte(16, 24, '700', '0.01em'),
        libelle: texte(14, 20, '700', '0.01em'),
        legende: texte(12, 16, '600', '0.02em'),
      },
      // radius/sm, md, lg, xl, full du Figma (remplacent les valeurs de Tailwind).
      // Les espacements Figma tombent sur l'échelle de Tailwind :
      // xs=1 (4px), sm=2 (8px), md=3 (12px), lg=4 (16px), xl=6 (24px), 2xl=8 (32px).
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '24px',
      },
      // Les seules ombres du Figma : la fenêtre de confirmation et le disque de son halo.
      boxShadow: {
        fenetre: '0 20px 28px rgb(26 20 51 / 0.2)',
        disque: '0 4px 12px rgb(26 20 51 / 0.12)',
      },
    },
  },
  plugins: [],
};
