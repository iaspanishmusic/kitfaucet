require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');

const authRoutes = require('./routes/auth');
const homeRoutes = require('./routes/home');
const claimRoutes = require('./routes/claim');
const withdrawRoutes = require('./routes/withdraw');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Fait confiance au proxy (utile derrière Nginx/Render/Railway) pour avoir la vraie IP (req.ip)
app.set('trust proxy', 1);

app.use(
  session({
    store: new FileStore({ path: path.join(process.env.DATA_DIR || __dirname, 'sessions') }),
    secret: process.env.SESSION_SECRET || 'changez_moi',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 jours
      secure: process.env.NODE_ENV === 'production' // HTTPS obligatoire en prod
    }
  })
);

app.use('/', authRoutes);
app.use('/', homeRoutes);
app.use('/', claimRoutes);
app.use('/', withdrawRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).send('Page non trouvée.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Faucet lancé sur http://localhost:${PORT}`);
});
