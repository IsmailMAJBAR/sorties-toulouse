// Choisir (ou changer) le mot de passe du site. À lancer dans un terminal, sur ton PC :
//
//     node scripts/mot-de-passe.mjs
//
// 1. tu tapes le mot de passe deux fois (il ne s'affiche pas ; 12 caractères minimum) ;
// 2. le script en tire la clé (PBKDF2-SHA-256, 600 000 itérations, sel de data/crypto.json) ;
// 3. il envoie CETTE CLÉ (jamais le mot de passe) dans le secret GitHub SITE_KEY du dépôt, via « gh » ;
// 4. il relance la mise à jour du site, qui se rechiffre avec la nouvelle clé.
// Le mot de passe ne quitte jamais ce PC et n'est écrit nulle part.
// Sur le téléphone : le site le demande une fois, puis garde la clé (case « Rester connecté »).

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCryptoConfig, deriveKey } from './crypto.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const stop = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };

function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData);
          stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') { stdout.write('\n'); process.exit(130); }     // Ctrl+C
        if (ch === '\u007f' || ch === '\b') { if (value) { value = value.slice(0, -1); stdout.write('\b \b'); } continue; }
        value += ch; stdout.write('•');
      }
    };
    stdin.on('data', onData);
  });
}

function repoName() {
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' });
  const m = (r.stdout || '').trim().match(/github\.com[:/](.+?)(\.git)?$/);
  if (!m) stop('Pas de dépôt GitHub « origin » dans ce dossier.');
  return m[1];
}

async function main() {
  if (!process.stdin.isTTY) stop('Lance cette commande dans un terminal pour taper le mot de passe (il ne s\'affiche pas).');
  const repo = repoName();
  const { salt, iterations } = await readCryptoConfig(join(ROOT, 'data', 'crypto.json'));

  console.log(`Mot de passe du site (dépôt ${repo}).`);
  console.log('Le fichier chiffré est public : prends au moins 12 caractères, idéalement une phrase (ex. 4 mots).\n');
  const a = await askHidden('Mot de passe : ');
  if (a.length < 12) stop('Trop court : 12 caractères minimum. Rien n\'a été changé.');
  const b = await askHidden('Encore une fois : ');
  if (a !== b) stop('Les deux saisies sont différentes. Rien n\'a été changé.');

  process.stdout.write('Calcul de la clé… ');
  const key = deriveKey(a, salt, iterations);
  console.log('ok');

  const set = spawnSync('gh', ['secret', 'set', 'SITE_KEY', '--repo', repo], { input: key, encoding: 'utf8' });
  if (set.status !== 0) stop(`Envoi du secret impossible : ${(set.stderr || '').trim() || 'gh a échoué'}`);
  console.log('✓ Clé enregistrée dans le secret SITE_KEY du dépôt (le mot de passe, lui, n\'a été envoyé nulle part).');

  const run = spawnSync('gh', ['workflow', 'run', 'update.yml', '--repo', repo], { encoding: 'utf8' });
  if (run.status === 0) console.log('✓ Mise à jour du site lancée : il sera prêt dans 2-3 minutes (onglet Actions du dépôt).');
  else console.log('ℹ Lance la mise à jour à la main : onglet Actions → Mise à jour des sorties → Run workflow.');
  console.log('\nSur chaque appareil, le site demandera ce mot de passe une fois.');
}

main().catch((e) => stop(e.message));
