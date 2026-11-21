// Chiffrement des données du site (même méthode que les guides) :
//   AES-256-GCM ; clé tirée du mot de passe par PBKDF2-SHA-256, 600 000 itérations, sel fixe (data/crypto.json).
// Le dépôt est public : seul data/events.enc.json (chiffré) y est publié, jamais data/events.json.
// GitHub Actions ne connaît que la clé (secret SITE_KEY), pas le mot de passe.

import { readFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pbkdf2Sync, webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

export async function readCryptoConfig(path) {
  const c = JSON.parse(await readFile(path, 'utf8'));
  if (!c.salt || !c.iterations) throw new Error(`${path} incomplet`);
  return c;
}

export function deriveKey(password, salt, iterations) {
  return b64(pbkdf2Sync(password.normalize('NFC'), Buffer.from(salt, 'base64'), iterations, 32, 'sha256'));
}

function checkKey(keyB64) {
  const k = unb64(keyB64 || '');
  if (k.length !== 32) throw new Error('SITE_KEY invalide (il faut la clé de 32 octets créée par scripts/mot-de-passe.mjs)');
  return k;
}

export async function encrypt(text, keyB64, { salt, iterations }) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await subtle.importKey('raw', checkKey(keyB64), 'AES-GCM', false, ['encrypt']);
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, gzipSync(text)));
  return JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iterations, salt, iv: b64(iv), data: b64(data) });
}

export async function decrypt(box, keyB64) {
  const key = await subtle.importKey('raw', checkKey(keyB64), 'AES-GCM', false, ['decrypt']);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
  return gunzipSync(Buffer.from(plain)).toString('utf8');
}
