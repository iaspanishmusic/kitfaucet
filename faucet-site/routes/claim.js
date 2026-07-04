const express = require('express');
const rateLimit = require('express-rate-limit');
const { db, getSetting, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const verifyCaptcha = require('../utils/verifyCaptcha');

const router = express.Router();

// Empêche un même IP de spammer la route même avec des comptes différents
const claimLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de requêtes. Ralentissez.'
});

router.get('/claim', requireAuth, claimLimiter, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const cooldown = parseInt(getSetting('claim_cooldown_seconds'), 10);
  const now = Date.now();
  const nextClaimAt = user.last_claim_at + cooldown * 1000;
  const canClaim = now >= nextClaimAt;

  res.render('claim', {
    user,
    canClaim,
    secondsLeft: canClaim ? 0 : Math.ceil((nextClaimAt - now) / 1000),
    claimAmount: getSetting('claim_amount'),
    currencyLabel: getSetting('currency_label'),
    hcaptchaSitekey: process.env.HCAPTCHA_SITEKEY,
    error: null,
    success: null
  });
});

router.post('/claim', requireAuth, claimLimiter, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const cooldown = parseInt(getSetting('claim_cooldown_seconds'), 10);
  const now = Date.now();
  const nextClaimAt = user.last_claim_at + cooldown * 1000;

  const renderWith = (error, success) => {
    const canClaim = Date.now() >= nextClaimAt;
    return res.render('claim', {
      user: db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId),
      canClaim,
      secondsLeft: canClaim ? 0 : Math.ceil((nextClaimAt - Date.now()) / 1000),
      claimAmount: getSetting('claim_amount'),
      currencyLabel: getSetting('currency_label'),
      hcaptchaSitekey: process.env.HCAPTCHA_SITEKEY,
      error,
      success
    });
  };

  if (user.is_banned) {
    return renderWith('Ce compte a été suspendu.', null);
  }

  if (now < nextClaimAt) {
    return renderWith('Vous devez attendre avant de réclamer à nouveau.', null);
  }

  const captchaOk = await verifyCaptcha(req.body['h-captcha-response'], req.ip);
  if (!captchaOk) {
    return renderWith('Vérification captcha échouée. Réessayez.', null);
  }

  const amount = parseFloat(getSetting('claim_amount'));

  const tx = transaction(() => {
    db.prepare(
      'UPDATE users SET balance = balance + ?, last_claim_at = ? WHERE id = ?'
    ).run(amount, now, user.id);

    db.prepare(
      'INSERT INTO claims (user_id, amount, ip_address, created_at) VALUES (?, ?, ?, ?)'
    ).run(user.id, amount, req.ip, now);
  });
  tx();

  return renderWith(null, `Vous avez reçu ${amount} ${getSetting('currency_label')} !`);
});

module.exports = router;
