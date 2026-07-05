const fetch = require('node-fetch');

async function verifyCaptcha(token, remoteip) {
  if (!token) {
    return { success: false, reason: 'Aucun token reçu (captcha non coché ou script bloqué).' };
  }

  const params = new URLSearchParams();
  params.append('secret', process.env.HCAPTCHA_SECRET);
  params.append('response', token);
  if (remoteip) params.append('remoteip', remoteip);

  try {
    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await res.json();
    if (!data.success) {
      return { success: false, reason: JSON.stringify(data) };
    }
    return { success: true };
  } catch (err) {
    return { success: false, reason: 'Erreur réseau: ' + err.message };
  }
}

module.exports = verifyCaptcha;