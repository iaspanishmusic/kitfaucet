const fetch = require('node-fetch');

async function verifyCaptcha(token, remoteip) {
  if (!token) return false;

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
      console.log('hCaptcha verification failed:', JSON.stringify(data));
    }
    return data.success === true;
  } catch (err) {
    console.error('Erreur vérification hCaptcha:', err);
    return false;
  }
}

module.exports = verifyCaptcha;