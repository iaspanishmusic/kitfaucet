const express = require('express');
const { db, getSetting, setSetting, getAllSettings } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

// ---------- DASHBOARD ----------
router.get('/', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const totalDistributed =
    db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM claims').get().s;
  const claimsToday = db
    .prepare('SELECT COUNT(*) AS c FROM claims WHERE created_at >= ?')
    .get(Date.now() - 24 * 60 * 60 * 1000).c;
  const pendingWithdrawals = db
    .prepare("SELECT COUNT(*) AS c FROM withdrawals WHERE status = 'pending'")
    .get().c;
  const recentClaims = db
    .prepare(
      `SELECT claims.id, claims.amount, claims.ip_address, claims.created_at, users.username
       FROM claims JOIN users ON users.id = claims.user_id
       ORDER BY claims.created_at DESC LIMIT 10`
    )
    .all();

  res.render('admin/dashboard', {
    totalUsers,
    totalDistributed,
    claimsToday,
    pendingWithdrawals,
    recentClaims,
    currencyLabel: getSetting('currency_label')
  });
});

// ---------- USERS ----------
router.get('/users', (req, res) => {
  const search = req.query.search || '';
  const users = search
    ? db
        .prepare('SELECT * FROM users WHERE username LIKE ? ORDER BY created_at DESC')
        .all(`%${search}%`)
    : db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 100').all();

  res.render('admin/users', { users, search, currencyLabel: getSetting('currency_label') });
});

router.post('/users/:id/ban', (req, res) => {
  db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(req.params.id);
  res.redirect(req.get('Referer') || '/admin/users');
});

router.post('/users/:id/unban', (req, res) => {
  db.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').run(req.params.id);
  res.redirect(req.get('Referer') || '/admin/users');
});

router.post('/users/:id/balance', (req, res) => {
  const newBalance = parseFloat(req.body.balance);
  if (!isNaN(newBalance) && newBalance >= 0) {
    db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, req.params.id);
  }
  res.redirect(req.get('Referer') || '/admin/users');
});

router.post('/users/:id/make-admin', (req, res) => {
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(req.params.id);
  res.redirect(req.get('Referer') || '/admin/users');
});

router.post('/users/:id/delete', (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.redirect(req.get('Referer') || '/admin/users');
});

// ---------- WITHDRAWALS ----------
router.get('/withdrawals', (req, res) => {
  const withdrawals = db
    .prepare(
      `SELECT withdrawals.*, users.username FROM withdrawals
       JOIN users ON users.id = withdrawals.user_id
       ORDER BY withdrawals.created_at DESC LIMIT 200`
    )
    .all();
  res.render('admin/withdrawals', { withdrawals, currencyLabel: getSetting('currency_label') });
});

// ---------- SETTINGS ----------
router.get('/settings', (req, res) => {
  res.render('admin/settings', { settings: getAllSettings(), saved: false });
});

router.post('/settings', (req, res) => {
  const allowedKeys = [
    'site_name',
    'claim_amount',
    'claim_cooldown_seconds',
    'min_withdraw',
    'currency_label'
  ];
  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) {
      setSetting(key, req.body[key]);
    }
  }
  res.render('admin/settings', { settings: getAllSettings(), saved: true });
});

module.exports = router;
