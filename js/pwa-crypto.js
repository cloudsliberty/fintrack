// FinTrack PWA — crypto.js
//
// Security model (read this before assuming more than it provides):
//   - Every value written to IndexedDB (auth credentials, cached API data, settings) is encrypted
//     with AES-256-GCM. The key is derived (PBKDF2, 210,000 rounds, SHA-256) from the local PIN
//     the person sets up on first install — never from anything guessable or stored in plaintext.
//   - The PIN itself is never stored. Only a PBKDF2 verifier hash (separate salt) is stored, to
//     check a PIN attempt without needing the encryption key itself in memory persistently.
//   - Each Nextcloud identity (server URL + login name) gets its own IndexedDB database, so if
//     multiple people use FinTrack in the same browser profile, their data is fully separated —
//     opening the app always requires the PIN for whichever identity is "current" on this device,
//     and switching accounts requires re-authenticating.
//
// Honest limitation: this is client-side JavaScript running in a shared browser profile. Anyone
// who can run arbitrary JS in this origin (a malicious extension, a compromised browser, physical
// access with dev tools while unlocked) can, in principle, intercept the PIN as it's typed or the
// derived key while the app is unlocked. What this DOES protect against: casual/opportunistic
// inspection of IndexedDB at rest (e.g. someone else on a shared computer poking at browser
// storage without knowing the PIN gets ciphertext, not your account balances), and cross-user
// bleed between multiple FinTrack logins in the same browser. It is not a substitute for OS-level
// disk encryption or a trusted device.

const FT_CRYPTO = (() => {
  const PBKDF2_ITERATIONS = 210_000;

  function randomBytes(len) {
    return crypto.getRandomValues(new Uint8Array(len));
  }

  function toB64(bytes) {
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }

  function fromB64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function deriveKey(pin, saltBytes, usage = ['encrypt', 'decrypt']) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      usage
    );
  }

  /** Derives a PBKDF2 verifier (not the encryption key) so a PIN attempt can be checked without holding the real key around. */
  async function derivePinVerifier(pin, saltBytes) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      baseKey,
      256
    );
    return toB64(new Uint8Array(bits));
  }

  async function encryptJSON(key, value) {
    const iv = randomBytes(12);
    const enc = new TextEncoder();
    const plaintext = enc.encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return { iv: toB64(iv), data: toB64(new Uint8Array(ciphertext)) };
  }

  async function decryptJSON(key, payload) {
    const iv = fromB64(payload.iv);
    const data = fromB64(payload.data);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  /** Stable, non-reversible identifier for a Nextcloud identity (server + login), used to namespace IndexedDB per user. */
  async function identityHash(serverUrl, loginName) {
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${serverUrl}::${loginName}`));
    return toB64(new Uint8Array(digest)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  }

  return { randomBytes, toB64, fromB64, deriveKey, derivePinVerifier, encryptJSON, decryptJSON, identityHash };
})();
