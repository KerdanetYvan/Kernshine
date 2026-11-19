// Écrit la page d'une release GitHub, pensée pour le grand public : bannière,
// lien de téléchargement, nouveautés lisibles, installation pas à pas.
// Le CHANGELOG reste au format Keep a Changelog : seuls les titres sont rendus
// plus parlants ici. Appelé par .github/workflows/release.yml.
//
// Usage : node scripts/release-notes.mjs <version> <tag> <installeur.exe> <dépôt owner/nom> <commit>

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

const [version, tag, installer, repo, commit] = process.argv.slice(2);
if (!version || !tag || !installer || !repo || !commit) {
  console.error('Usage : release-notes.mjs <version> <tag> <installeur> <dépôt> <commit>');
  process.exit(1);
}

const fichier = basename(installer);
const url = `https://github.com/${repo}/releases/download/${tag}/${fichier}`;
// Image figée sur le commit de la release : la page ne change pas si la bannière évolue.
const banniere = `https://raw.githubusercontent.com/${repo}/${commit}/docs/release/banniere.png`;
const taille = (statSync(installer).size / 1024 / 1024).toFixed(1).replace('.', ',');
const empreinte = createHash('sha256').update(readFileSync(installer)).digest('hex');
const preVersion = version.includes('-');

// Nouveautés : la section du CHANGELOG, avec des titres plus parlants.
const TITRES = {
  Ajouté: '✨ Nouveautés',
  Modifié: '🛠️ Améliorations',
  Corrigé: '🐞 Corrections',
  Supprimé: '🧹 Retiré',
  Connu: '🕒 Bon à savoir',
};
const section = execFileSync(process.execPath, ['scripts/extract-changelog.mjs', version], {
  encoding: 'utf8',
}).trim();
const [premiere, ...reste] = section.split('\n');
// extract-changelog.mjs met la phrase d'accroche en titre : ici, c'est un paragraphe.
const accroche = premiere.startsWith('## ') ? premiere.slice(3).trim() : '';
const nouveautes = (accroche ? reste : [premiere, ...reste])
  .map((l) => l.replace(/^### (\S+)\s*$/, (m, t) => (TITRES[t] ? `### ${TITRES[t]}` : m)))
  .join('\n')
  .trim();

// Présentation : le pitch sans sa première ligne (le nom, déjà dans la bannière).
const presentation = readFileSync('docs/PRESENTATION.md', 'utf8')
  .split('\n')
  .slice(1)
  .join('\n')
  .trim();

const lignes = [
  '<p align="center">',
  `  <img src="${banniere}" alt="Kernshine — Votre PC, en bonne santé." width="100%">`,
  '</p>',
  '',
  '<h2 align="center">',
  `  <a href="${url}">⬇️ Télécharger Kernshine ${version}</a>`,
  '</h2>',
  `<p align="center">Pour Windows 10 et 11 · ${taille} Mo · gratuit et open source</p>`,
  '',
  '> 💡 **Kernshine est déjà installé sur votre PC ?**',
  '> Pas besoin de télécharger quoi que ce soit : Kernshine vous propose cette version tout seul, dans **Paramètres › À propos**.',
  '',
];
if (preVersion) {
  lignes.push(
    `> 🧪 **Version de test.** Kernshine est encore en cours de développement : quelques bugs peuvent survenir. Si vous en croisez un, [dites-le-nous](https://github.com/${repo}/issues).`,
    '',
  );
}
lignes.push(
  '## Quoi de neuf ?',
  '',
  ...(accroche ? [`**${accroche}**`, ''] : []),
  nouveautes,
  '',
  '## Installer Kernshine en 3 étapes',
  '',
  `1. **Téléchargez** [${fichier}](${url}).`,
  "2. **Ouvrez le fichier.** Windows peut afficher « Windows a protégé votre ordinateur » : Kernshine n'a pas encore de certificat Microsoft. Cliquez sur **Informations complémentaires**, puis sur **Exécuter quand même**.",
  '3. **Suivez les étapes** : installez Kernshine pour vous seul ou pour tous les utilisateurs du PC, choisissez le dossier, et gardez la case du raccourci sur le bureau si vous le souhaitez. Kernshine s\'ouvre à la fin.',
  '',
  "## Kernshine, c'est quoi ?",
  '',
  presentation,
  '',
  '<details>',
  '<summary>🔒 Vérifier le fichier téléchargé (facultatif)</summary>',
  '',
  "Pour vous assurer que le fichier n'a pas été modifié, comparez son empreinte avec celle-ci :",
  '',
  '```',
  `${empreinte}  ${fichier}`,
  '```',
  '',
  `Dans PowerShell : \`Get-FileHash .\\${fichier}\` (majuscules ou minuscules, peu importe).`,
  '',
  '</details>',
);

process.stdout.write(`${lignes.join('\n')}\n`);
