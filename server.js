const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory store ────────────────────────────────────────
const scores = [];      // tableau de nombres (rétrocompat stats)
const submissions = []; // tableau complet { score, company, timestamp }
const clients = new Set();

// ── Stats cache incrémental ────────────────────────────────
// Évite de recalculer en O(n) à chaque soumission
let statsCache = null;
let statsDirty = true;
let scoreSum = 0;
const distribution = {};
for (let i = 5; i <= 15; i++) distribution[i] = 0;
const profiles = { survie: 0, pompier: 0, pilotage: 0 };

function addScoreToCache(score) {
  distribution[score]++;
  scoreSum += score;
  if (score >= 5 && score <= 8)  profiles.survie++;
  else if (score >= 9 && score <= 12) profiles.pompier++;
  else if (score >= 13 && score <= 15) profiles.pilotage++;
  statsDirty = true;
}

function resetCache() {
  for (let i = 5; i <= 15; i++) distribution[i] = 0;
  profiles.survie = 0;
  profiles.pompier = 0;
  profiles.pilotage = 0;
  scoreSum = 0;
  statsDirty = true;
  statsCache = null;
}

function getStats() {
  if (!statsDirty && statsCache) return statsCache;

  const total = scores.length;
  const average = total > 0 ? (scoreSum / total).toFixed(1) : null;

  statsCache = {
    total,
    distribution: { ...distribution },
    profiles: { ...profiles },
    average,
  };
  statsDirty = false;
  return statsCache;
}

// ── Broadcast avec debounce ────────────────────────────────
// Regroupe les mises à jour pour éviter 500×500 écritures en burst
let broadcastTimer = null;

function scheduleBroadcast() {
  if (broadcastTimer) return; // déjà planifié
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const payload = `data: ${JSON.stringify(getStats())}\n\n`;
    clients.forEach(res => {
      try { res.write(payload); } catch (e) { clients.delete(res); }
    });
  }, 200); // max 5 broadcasts/sec au lieu de 500
}

// ── Server-Sent Events — mise à jour en temps réel ─────────
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

// ── Soumission d'un score ──────────────────────────────────
app.post('/submit', (req, res) => {
  const score = parseInt(req.body.score, 10);

  if (!Number.isInteger(score) || score < 5 || score > 15) {
    return res.status(400).json({ error: 'Score invalide (doit être entre 5 et 15)' });
  }

  const company = typeof req.body.company === 'string'
    ? req.body.company.trim().slice(0, 100)
    : '';

  scores.push(score);
  submissions.push({ score, company, timestamp: Date.now() });
  addScoreToCache(score);

  const stats = getStats();
  scheduleBroadcast(); // debounced au lieu de broadcast immédiat

  const below = scores.filter(s => s < score).length;
  const percentile = Math.round((below / scores.length) * 100);

  res.json({ success: true, stats, percentile });
});

// ── Stats courantes ────────────────────────────────────────
app.get('/stats', (req, res) => res.json(getStats()));

// ── Page d'administration (URL privée) ─────────────────────
app.get('/admin-adn-1234', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── Remise à zéro (organisateur) ───────────────────────────
app.post('/reset', (req, res) => {
  scores.length = 0;
  submissions.length = 0;
  resetCache();
  const stats = getStats();

  // Broadcast immédiat pour le reset (événement rare)
  const payload = `data: ${JSON.stringify(stats)}\n\n`;
  clients.forEach(r => {
    try { r.write(payload); } catch (e) { clients.delete(r); }
  });

  console.log('🔄 Remise à zéro effectuée');
  res.json({ success: true, message: 'Données réinitialisées.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Baromètre de Maturité Data démarré`);
  console.log(`   → http://localhost:${PORT}\n`);
});
