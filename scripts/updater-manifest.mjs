// Écrit le `latest.json` lu par le module de mise à jour de Tauri.
// Appelé par .github/workflows/release.yml après la construction de l'installeur signé.
//
// Usage : node scripts/updater-manifest.mjs <version> <url de l'installeur> <fichier .sig> <notes.md> <sortie>

import { readFileSync, writeFileSync } from 'node:fs';

const [version, url, sigFile, notesFile, out] = process.argv.slice(2);
if (!version || !url || !sigFile || !notesFile || !out) {
  console.error('Usage : updater-manifest.mjs <version> <url> <sig> <notes> <sortie>');
  process.exit(1);
}
if (!url.startsWith('https://')) {
  console.error(`Adresse de l'installeur non sécurisée : ${url}`);
  process.exit(1);
}

const signature = readFileSync(sigFile, 'utf8').trim();
if (!signature) {
  console.error(`Signature vide : ${sigFile}`);
  process.exit(1);
}

const manifest = {
  version,
  notes: readFileSync(notesFile, 'utf8').trim(),
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': { signature, url },
  },
};

writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${out} : ${version} → ${url}`);
