const express = require('express');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const { db, getSetting, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const withdrawLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Trop de demandes de retrait. Réessayez plus tard.'
});

router.get('/withdraw', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  res.render('withdraw', {
    user,
    minWithdraw: getSetting('min_withdraw'),
    currencyLabel: getSetting('currency_label'),
    error: null,
    success: null
  });
});

router.post('/withdraw', requireAuth, withdrawLimiter, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const minWithdraw = parseFloat(getSetting('min_withdraw'));
  const { faucetpay_email, amount } = req.body;

  const renderWith = (error, success) =>
    res.render('withdraw', {
      user: db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId),
      minWithdraw,
      currencyLabel: getSetting('currency_label'),
      error,
      success
    });

  const amt = parseFloat(amount);

  if (!faucetpay_email || !amt) {
    return renderWith('Tous les champs sont requis.', null);
  }
  if (amt < minWithdraw) {
    return renderWith(`Le retrait minimum est de ${minWithdraw}.`, null);
  }
  if (amt > user.balance) {
    return renderWith('Solde insuffisant.', null);
  }

  // Débit immédiat + enregistrement de la demande, puis appel à FaucetPay.
  // Si l'appel échoue, on rembourse l'utilisateur et on marque la demande "failed".
  const insertId = transaction(() => {
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amt, user.id);
    const info = db
      .prepare(
        'INSERT INTO withdrawals (user_id, amount, faucetpay_email, status, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(user.id, amt, faucetpay_email.trim(), 'pending', Date.now());
    return info.lastInsertRowid;
  })();

  try {
    const params = new URLSearchParams();
    params.append('api_key', process.env.FAUCETPAY_API_KEY);
    params.append('amount', amt);
    params.append('to', faucetpay_email.trim());
    params.append('currency', 'USDT'); // adaptez selon la crypto distribuée

    const fpRes = await fetch('https://faucetpay.io/api/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const fpData = await fpRes.json();

    if (fpData.status === 200) {
      db.prepare(
        "UPDATE withdrawals SET status = 'completed', processed_at = ? WHERE id = ?"
      ).run(Date.now(), insertId);
      return renderWith(null, 'Retrait envoyé avec succès !');
    } else {
      // échec côté FaucetPay -> remboursement
      transaction(() => {
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amt, user.id);
        db.prepare(
          "UPDATE withdrawals SET status = 'failed', processed_at = ? WHERE id = ?"
        ).run(Date.now(), insertId);
      })();
      return renderWith(fpData.message || 'Échec du retrait. Solde remboursé.', null);
    }
  } catch (err) {
    console.error('Erreur FaucetPay:', err);
    transaction(() => {
      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amt, user.id);
      db.prepare(
        "UPDATE withdrawals SET status = 'failed', processed_at = ? WHERE id = ?"
      ).run(Date.now(), insertId);
    })();
    return renderWith('Erreur technique. Solde remboursé.', null);
  }
});

module.exports = router;
