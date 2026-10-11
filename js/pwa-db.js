// FinTrack PWA — db.js
//
// Two tiers of storage:
//  1. `fintrack_device` — one shared, UNencrypted DB. Holds only non-secret bookkeeping: which
//     Nextcloud identities (server+login) have ever signed in on this device, their PIN salt/
//     verifier (a verifier is safe to store in the clear — it can check a guess, not produce the
//     key), and which one was active last. No app password, no financial data ever lives here.
//  2. `fintrack_data_<identityHash>` — one DB per identity, created the first time that identity
//     logs in. Every value stored in it is AES-GCM ciphertext (see crypto.js); the key only exists
//     in memory after the PIN is verified for that identity, for that page session.

const FT_DB = (() => {
  function openDb(name, version, upgrade) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(db, storeName, mode) {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  let devicePromise = null;
  function deviceDb() {
    if (!devicePromise) {
      devicePromise = openDb('fintrack_device', 1, (db) => {
        if (!db.objectStoreNames.contains('identities')) {
          db.createObjectStore('identities', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      });
    }
    return devicePromise;
  }

  async function listIdentities() {
    const db = await deviceDb();
    return reqToPromise(tx(db, 'identities', 'readonly').getAll());
  }

  async function saveIdentity(record) {
    const db = await deviceDb();
    return reqToPromise(tx(db, 'identities', 'readwrite').put(record));
  }

  async function deleteIdentity(id) {
    const db = await deviceDb();
    return reqToPromise(tx(db, 'identities', 'readwrite').delete(id));
  }

  async function getMeta(key) {
    const db = await deviceDb();
    const rec = await reqToPromise(tx(db, 'meta', 'readonly').get(key));
    return rec ? rec.value : undefined;
  }

  async function setMeta(key, value) {
    const db = await deviceDb();
    return reqToPromise(tx(db, 'meta', 'readwrite').put({ key, value }));
  }

  const identityDbPromises = {};
  function identityDb(identityHash) {
    if (!identityDbPromises[identityHash]) {
      identityDbPromises[identityHash] = openDb(`fintrack_data_${identityHash}`, 2, (db) => {
        if (!db.objectStoreNames.contains('secure')) db.createObjectStore('secure', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
        // v1 scaffolded 'pending' with keyPath 'id', which never matched the
        // {key, iv, data} shape putEncrypted()/getAllDecrypted() write —
        // it was created but never actually read or written to. Recreated
        // here with keyPath 'key' so it works the same way secure/cache do.
        if (db.objectStoreNames.contains('pending')) db.deleteObjectStore('pending');
        db.createObjectStore('pending', { keyPath: 'key' });
      });
    }
    return identityDbPromises[identityHash];
  }

  async function putEncrypted(identityHash, storeName, key, cryptoKey, value) {
    const db = await identityDb(identityHash);
    const payload = await FT_CRYPTO.encryptJSON(cryptoKey, value);
    return reqToPromise(tx(db, storeName, 'readwrite').put({ key, ...payload }));
  }

  async function getDecrypted(identityHash, storeName, key, cryptoKey) {
    const db = await identityDb(identityHash);
    const rec = await reqToPromise(tx(db, storeName, 'readonly').get(key));
    if (!rec) return undefined;
    return FT_CRYPTO.decryptJSON(cryptoKey, rec);
  }

  async function deleteKey(identityHash, storeName, key) {
    const db = await identityDb(identityHash);
    return reqToPromise(tx(db, storeName, 'readwrite').delete(key));
  }

  async function getAllDecrypted(identityHash, storeName, cryptoKey) {
    const db = await identityDb(identityHash);
    const all = await reqToPromise(tx(db, storeName, 'readonly').getAll());
    return Promise.all(all.map((rec) => FT_CRYPTO.decryptJSON(cryptoKey, rec).then((v) => ({ id: rec.key, value: v }))));
  }

  async function wipeIdentityData(identityHash) {
    // Deleting the whole per-identity database is simpler and more thorough than clearing stores
    // one by one, and guarantees nothing lingers if a store gets added later.
    return new Promise((resolve, reject) => {
      delete identityDbPromises[identityHash];
      const req = indexedDB.deleteDatabase(`fintrack_data_${identityHash}`);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  }

  // ── Offline pending-transactions queue ──
  // Encrypted the same way as everything else in 'secure'/'cache' (see
  // putEncrypted/getAllDecrypted above), just keyed by a locally-generated
  // id instead of a fixed settings key, since there can be many of them.
  async function addPending(identityHash, cryptoKey, entry) {
    const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await putEncrypted(identityHash, 'pending', id, cryptoKey, entry);
    return id;
  }

  async function listPending(identityHash, cryptoKey) {
    return getAllDecrypted(identityHash, 'pending', cryptoKey);
  }

  async function removePending(identityHash, id) {
    return deleteKey(identityHash, 'pending', id);
  }

  return {
    listIdentities, saveIdentity, deleteIdentity, getMeta, setMeta,
    putEncrypted, getDecrypted, deleteKey, getAllDecrypted, wipeIdentityData,
    addPending, listPending, removePending
  };
})();
