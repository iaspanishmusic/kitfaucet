const express = require('express');
const { db, getSetting } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  res.render('home', {
    user,
    siteName: getSetting('site_name'),
    currencyLabel: getSetting('currency_label')
  });
});

module.exports = router;
