function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

function redirectIfAuth(req, res, next) {
  if (req.session.userId) {
    return res.redirect('/');
  }
  next();
}

function requireAdmin(req, res, next) {
  const { db } = require('../db');
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.is_admin) {
    return res.status(403).send('Accès refusé.');
  }
  next();
}

module.exports = { requireAuth, redirectIfAuth, requireAdmin };
