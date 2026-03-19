const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store (scores des participants)
const scores = [];
const clients = new Set()

function getStats() {
  const total = scores.length;

  const distribution = {};
  for (let i = 5; i <= 15; i++) distribution[i] = 0;
  scores.forEach(s => { if (distribution[s] !== undefined) distribution[s]++; });

  const profiles = {
    survie:   scores.filter(s => s >= 5  && s <= 8).length,
    pompier:  scores.filter(s => s >= 9  && s <= 12).length,
    pilotage: scores.filter(s => s >= 13 && s <= 15).length,
  };

  const average = total > 0
    ? (scores.reduce((a, b) => a + b, 0) / total).toFixed(1)
    : null;

  return { total, distribution, profiles, average };
}

function broadcast(stats) {
  const payload = `data: ${JSON.stringify(stats)}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch (e) { clients.delete(res); }
  });
}

// Server-Sent Events — mise à jour en temps réel
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`data: ${JSON.stringify(getStats())}\n\n`);
  clients.add(res);

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (e) { clearInterval(ping); clients.delete(res); }
  }, 20000);

  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

// Soumission d'un score
app.post('/submit', (req, res) => {

  const score = parseInt(req.body.score, 10);

  if (!Number.isInteger(score) || score < 5 || score > 15) {
    return res.status(400).json({ error: 'Score invalide (doit être entre 5 et 15)' });
  }

  scores.push(score);
  const stats = getStats();
  broadcast(stats);

  const below = scores.filter(s => s < score).length;
  const percentile = Math.round((below / scores.length) * 100);

  res.json({ success: true, stats, percentile });
});

// Stats courantes
app.get('/stats', (req, res) => res.json(getStats()));

// Page d'administration (URL privée)
app.get('/admin-adn-1234', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Remise à zéro (organisateur)
app.post('/reset', (req, res) => {
  scores.length = 0;
  const stats = getStats();
  broadcast(stats);
  console.log('🔄 Remise à zéro effectuée');
  res.json({ success: true, message: 'Données réinitialisées.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Baromètre de Maturité Data démarré`);
  console.log(`   → http://localhost:${PORT}\n`);
});
