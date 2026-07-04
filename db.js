const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Sur un hébergeur avec volume persistant (Railway, etc.), définissez DATA_DIR
// pour pointer vers le dossier monté (ex: /data). En local, ça reste dans le projet.
const dataDir = process.env.DATA_DIR || __dirname;

const db = new DatabaseSync(path.join(dataDir, 'faucet.db'));

db.exec('PRAGMA journal_mode = WAL');

// Table des utilisateurs
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    pin_hash TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    last_claim_at INTEGER DEFAULT 0,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER DEFAULT 0,
    faucetpay_email TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_banned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);

// Table des réglages du faucet, modifiables depuis l'admin sans redémarrer le serveur
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// Table des demandes de retrait
db.exec(`
  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    faucetpay_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    processed_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Historique des réclamations (utile pour l'audit anti-fraude)
db.exec(`
  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    ip_address TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Valeurs par défaut des réglages (ne les écrase pas si déjà présentes)
const defaultSettings = {
  site_name: 'CryptoFaucet',
  claim_amount: '10',
  claim_cooldown_seconds: '3600',
  min_withdraw: '1000',
  currency_label: 'points'
};
const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach((r) => (obj[r.key] = r.value));
  return obj;
}

// node:sqlite n'a pas de helper .transaction() natif comme better-sqlite3,
// on le recrée manuellement avec BEGIN/COMMIT/ROLLBACK.
function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

module.exports = { db, getSetting, setSetting, getAllSettings, transaction };
