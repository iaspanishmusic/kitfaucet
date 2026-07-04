const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { redirectIfAuth } = require('../middleware/auth');
const verifyCaptcha = require('../utils/verifyCaptcha');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Limite globale : évite le spam de création de comptes / tentatives de connexion
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de tentatives. Réessayez plus tard.'
});

router.use(authLimiter);

// ---------- SIGNUP ----------
router.get('/signup', redirectIfAuth, (req, res) => {
  res.render('signup', {
    error: null,
    hcaptchaSitekey: process.env.HCAPTCHA_SITEKEY
  });
});

router.post('/signup', redirectIfAuth, async (req, res) => {
  const { username, pin, pin_confirm, 'h-captcha-response': captchaToken } = req.body;
  const renderError = (msg) =>
    res.render('signup', { error: msg, hcaptchaSitekey: process.env.HCAPTCHA_SITEKEY });

  if (!username || !pin || !pin_confirm) {
    return renderError('Tous les champs sont requis.');
  }

  const cleanUsername = username.trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
    return renderError("Nom d'utilisateur invalide (3-20 caractères, lettres/chiffres/_).");
  }

  if (!/^\d{6,}$/.test(pin)) {
    return renderError('Le code PIN doit contenir au moins 6 chiffres.');
  }

  if (pin !== pin_confirm) {
    return renderError('Les codes PIN ne correspondent pas.');
  }

  const captchaOk = await verifyCaptcha(captchaToken, req.ip);
  if (!captchaOk) {
    return renderError('Vérification captcha échouée. Réessayez.');
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
  if (existing) {
    return renderError('Ce nom d\'utilisateur existe déjà.');
  }

  const pinHash = await bcrypt.hash(pin, 12);

  db.prepare(
    'INSERT INTO users (username, pin_hash, created_at) VALUES (?, ?, ?)'
  ).run(cleanUsername, pinHash, Date.now());

  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
  req.session.userId = user.id;
  res.redirect('/');
});

// ---------- LOGIN ----------
router.get('/login', redirectIfAuth, (req, res) => {
  res.render('login', {
    error: null,
    hcaptchaSitekey: process.env.HCAPTCHA_SITEKEY
  });
});

router.post('/login', redirectIfAuth, async (req, res) => {
  const { username, pin, 'h-captcha-response': captchaToken } = req.body;
  const renderError = (msg) =>
    res.render('login', { error: msg, hcaptchaSitekey: process.env.HCAPTCHA_SITEKEY });

  if (!username || !pin) {
    return renderError('Tous les champs sont requis.');
  }

  const captchaOk = await verifyCaptcha(captchaToken, req.ip);
  if (!captchaOk) {
    return renderError('Vérification captcha échouée. Réessayez.');
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) {
    return renderError('Identifiants incorrects.');
  }

  if (user.is_banned) {
    return renderError('Ce compte a été suspendu.');
  }

  if (user.locked_until && user.locked_until > Date.now()) {
    const minutesLeft = Math.ceil((user.locked_until - Date.now()) / 60000);
    return renderError(`Compte temporairement verrouillé. Réessayez dans ${minutesLeft} min.`);
  }

  const match = await bcrypt.compare(pin, user.pin_hash);
  if (!match) {
    const attempts = user.failed_login_attempts + 1;
    let lockedUntil = 0;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = Date.now() + LOCK_DURATION_MS;
    }
    db.prepare(
      'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?'
    ).run(attempts, lockedUntil, user.id);
    return renderError('Identifiants incorrects.');
  }

  // reset des tentatives ratées
  db.prepare(
    'UPDATE users SET failed_login_attempts = 0, locked_until = 0 WHERE id = ?'
  ).run(user.id);

  req.session.userId = user.id;
  res.redirect('/');
});

// ---------- LOGOUT ----------
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
