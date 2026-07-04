// Usage : node scripts/create-admin.js <username> <pin>
// Si l'utilisateur existe déjà, il est simplement promu admin.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db } = require('../db');

async function main() {
  const [, , username, pin] = process.argv;

  if (!username || !pin) {
    console.log('Usage : node scripts/create-admin.js <username> <pin>');
    process.exit(1);
  }

  if (!/^\d{6,}$/.test(pin)) {
    console.log('Le PIN doit contenir au moins 6 chiffres.');
    process.exit(1);
  }

  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (existing) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
    console.log(`L'utilisateur "${username}" est maintenant admin.`);
  } else {
    const pinHash = await bcrypt.hash(pin, 12);
    db.prepare(
      'INSERT INTO users (username, pin_hash, is_admin, created_at) VALUES (?, ?, 1, ?)'
    ).run(username, pinHash, Date.now());
    console.log(`Compte admin "${username}" créé avec succès.`);
  }
  process.exit(0);
}

main();
