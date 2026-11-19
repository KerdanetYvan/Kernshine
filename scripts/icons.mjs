// Génère les icônes de l'application et les images de l'installeur à partir du
// logo Kernshine.
//
// `tauri icon` produit toutes les tailles depuis un seul dessin. Or la charte
// demande la version simplifiée du logo sous 32 px (sinon l'éclat et le contour
// deviennent illisibles dans la barre des tâches). On génère donc tout avec le
// logo complet, puis on reconstruit `icon.ico` : 16 et 24 px depuis la version
// simplifiée, 32 px et plus depuis la version complète.
//
// Les images de l'installeur (src-tauri/installer/*.bmp) sont assemblées par
// scripts/installer-images.ps1 à partir des logos dessinés ici.
//
// Usage : npm run icons

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOGO = 'src/assets/logo/kernshine-mark.svg';
const LOGO_SIMPLIFIE = 'src/assets/logo/kernshine-mark-simplifie.svg';
const LOCKUP_COMPACT = 'src/assets/logo/kernshine-lockup-compact.svg';
const ICONS = 'src-tauri/icons';
const INSTALLEUR = 'src-tauri/installer';
const TAILLES_SIMPLIFIEES = [16, 24];
const TAILLES_COMPLETES = [32, 48, 64, 256];

function tauriIcon(args) {
  execFileSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', 'icon', ...args], {
    stdio: 'inherit',
  });
}

// Assemble des PNG en un fichier .ico (entrées PNG, lues par Windows depuis Vista).
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // réservé
  header.writeUInt16LE(1, 2); // type : icône
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 veut dire 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // pas de palette
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); // plans
    e.writeUInt16LE(32, 6); // bits par pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

// 1. Toutes les icônes depuis le logo complet.
tauriIcon([LOGO, '-o', ICONS]);
// Application Windows uniquement : pas d'icônes Android ni iOS.
rmSync(join(ICONS, 'android'), { recursive: true, force: true });
rmSync(join(ICONS, 'ios'), { recursive: true, force: true });

// 2. icon.ico avec la version simplifiée pour les petites tailles.
const tmp = mkdtempSync(join(tmpdir(), 'kernshine-icons-'));
try {
  tauriIcon([LOGO_SIMPLIFIE, '-o', tmp, '-p', TAILLES_SIMPLIFIEES.join(',')]);
  tauriIcon([LOGO, '-o', tmp, '-p', TAILLES_COMPLETES.join(',')]);
  const pngs = [...TAILLES_SIMPLIFIEES, ...TAILLES_COMPLETES].map((size) => ({
    size,
    data: readFileSync(join(tmp, `${size}x${size}.png`)),
  }));
  writeFileSync(join(ICONS, 'icon.ico'), ico(pngs));
  console.log(`icon.ico : ${pngs.map((p) => p.size).join(', ')} px`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 3. Images de l'installeur.
mkdirSync(INSTALLEUR, { recursive: true });
// `tauri icon` n'accepte qu'un dessin carré : on centre le logo + nom dans un
// carré, puis on ne garde que la bande utile au moment d'assembler l'image.
const RENDU = 1024;
const tmpInstalleur = mkdtempSync(join(tmpdir(), 'kernshine-installeur-'));
try {
  const svg = readFileSync(LOCKUP_COMPACT, 'utf8');
  const [, largeur, hauteur] = svg.match(/<svg width="([\d.]+)" height="([\d.]+)"/).map(Number);
  const marge = (largeur - hauteur) / 2;
  const carre = svg.replace(
    /<svg width="[\d.]+" height="[\d.]+" viewBox="[^"]*"/,
    `<svg width="${largeur}" height="${largeur}" viewBox="0 ${-marge} ${largeur} ${largeur}"`,
  );
  const dossierLockup = join(tmpInstalleur, 'lockup');
  const dossierLogo = join(tmpInstalleur, 'logo');
  writeFileSync(join(tmpInstalleur, 'lockup-carre.svg'), carre);
  tauriIcon([join(tmpInstalleur, 'lockup-carre.svg'), '-o', dossierLockup, '-p', String(RENDU)]);
  tauriIcon([LOGO, '-o', dossierLogo, '-p', String(RENDU)]);

  execFileSync(
    'powershell.exe',
    [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/installer-images.ps1',
      '-Lockup', join(dossierLockup, `${RENDU}x${RENDU}.png`),
      '-LockupTop', String(Math.floor((marge / largeur) * RENDU)),
      '-LockupHeight', String(Math.ceil((hauteur / largeur) * RENDU)),
      '-Mark', join(dossierLogo, `${RENDU}x${RENDU}.png`),
      '-OutDir', INSTALLEUR,
    ],
    { stdio: 'inherit' },
  );
} finally {
  rmSync(tmpInstalleur, { recursive: true, force: true });
}
