const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Config (questions + profils) ─────────────────────────────────────────────

const CONFIG_FILE = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
  companyField: {
    visible:     false,
    label:       "Nom de votre entreprise",
    placeholder: "Ex : Dupont & Associés",
    required:    false,
  },
  questions: [
    {
      id: 1,
      text: "Vous devez prendre une décision importante. Que faites-vous ?",
      options: [
        { pts: 1, text: "Je refais mes propres calculs. Je ne me fie pas aux chiffres qu'on me donne." },
        { pts: 2, text: "Je consulte les chiffres disponibles, mais je sais qu'il faudra les vérifier." },
        { pts: 3, text: "Je consulte le tableau de bord et je décide. Les chiffres reflètent la réalité." },
      ],
    },
    {
      id: 2,
      text: "Vous découvrez une erreur dans les données. Que se passe-t-il ?",
      options: [
        { pts: 1, text: "Je corrige dans mon fichier. Personne ne sait vraiment à qui signaler le problème." },
        { pts: 2, text: "J'envoie un mail à l'informatique. C'est eux qui gèrent les données." },
        { pts: 3, text: "Je sais qui contacter côté métier. La correction est faite à la source pour tout le monde." },
      ],
    },
    {
      id: 3,
      text: "Vous cherchez une information sur un client ou un produit. Comment ça se passe ?",
      options: [
        { pts: 1, text: "Je demande à un collègue ou je fouille dans plusieurs fichiers. Chaque service a ses propres infos." },
        { pts: 2, text: "Je trouve l'info, mais parfois elle diffère selon les sources. Je ne sais pas laquelle est la bonne." },
        { pts: 3, text: "Je sais où chercher. L'information est à jour et c'est la même pour tout le monde." },
      ],
    },
    {
      id: 4,
      text: "Comment sont mises à jour vos données importantes (stocks, clients, tarifs…) ?",
      options: [
        { pts: 1, text: "Quand on y pense, ou quand on découvre que c'est faux. Certaines infos datent de plusieurs années." },
        { pts: 2, text: "On fait des campagnes de \"nettoyage\" de temps en temps, quand ça devient vraiment problématique." },
        { pts: 3, text: "Il y a un processus régulier. On sait qui met à jour quoi, et à quelle fréquence." },
      ],
    },
    {
      id: 5,
      text: "Vous avez besoin d'un nouveau rapport ou d'une nouvelle donnée. Comment ça se passe ?",
      options: [
        { pts: 1, text: "Je me débrouille seul avec Excel. Demander prend trop de temps ou personne ne comprend mon besoin." },
        { pts: 2, text: "Je fais une demande, mais c'est long et le résultat ne correspond pas toujours à ce que je voulais." },
        { pts: 3, text: "J'exprime mon besoin métier, on travaille ensemble pour y répondre. Chacun apporte son expertise." },
      ],
    },
  ],
  profiles: {
    survie: {
      label:    "Mode Survie",
      subtitle: '"Je me débrouille"',
      min:      5,
      max:      8,
      color:    "#ef4444",
      bg:       "rgba(239,68,68,.15)",
      border:   "#ef4444",
      desc:     "Vous passez du temps à chercher, vérifier, recopier. Chacun a ses propres fichiers. Quand il y a une erreur, on ne sait pas trop qui doit la corriger.",
      next:     "Identifiez une donnée qui vous fait perdre du temps chaque semaine. Proposez à votre équipe de clarifier : « C'est quoi la bonne source ? Qui la tient à jour ? »",
    },
    pompier: {
      label:    "Mode Pompier",
      subtitle: '"On fait avec"',
      min:      9,
      max:      12,
      color:    "#f59e0b",
      bg:       "rgba(245,158,11,.15)",
      border:   "#f59e0b",
      desc:     "Des outils existent, mais vous corrigez souvent les problèmes après coup. Quand vous avez besoin d'aide, vous ne savez pas toujours à qui vous adresser.",
      next:     "Clarifiez qui est responsable de quoi. Pour vos données critiques, identifiez un « propriétaire » côté métier qui garantit la qualité, et un interlocuteur technique qui garantit l'accès.",
    },
    pilotage: {
      label:    "Mode Pilotage",
      subtitle: '"On pilote"',
      min:      13,
      max:      15,
      color:    "#10b981",
      bg:       "rgba(16,185,129,.15)",
      border:   "#10b981",
      desc:     "Vos données sont fiables et accessibles. Vous savez qui contacter. Métier et technique travaillent main dans la main.",
      next:     "Traitez vos données comme un produit : avec un cycle de vie (création, mise à jour, archivage), des « clients » internes qui l'utilisent, et des engagements de qualité.",
    },
  },
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

let config = loadConfig();

function scoreRange() {
  const visible = config.questions.filter(q => q.visible !== false);
  const min = visible.reduce((s, q) => s + Math.min(...q.options.map(o => o.pts)), 0);
  const max = visible.reduce((s, q) => s + Math.max(...q.options.map(o => o.pts)), 0);
  return { min, max };
}

// ── In-memory score store ────────────────────────────────────────────────────

const scores = [];
const clients = new Set();

function getStats() {
  const total = scores.length;
  const { min, max } = scoreRange();

  const distribution = {};
  for (let i = min; i <= max; i++) distribution[i] = 0;
  scores.forEach(s => { if (distribution[s] !== undefined) distribution[s]++; });

  const p = config.profiles;
  const profiles = {
    survie:   scores.filter(s => s >= p.survie.min   && s <= p.survie.max).length,
    pompier:  scores.filter(s => s >= p.pompier.min  && s <= p.pompier.max).length,
    pilotage: scores.filter(s => s >= p.pilotage.min && s <= p.pilotage.max).length,
  };

  const average = total > 0
    ? (scores.reduce((a, b) => a + b, 0) / total).toFixed(1)
    : null;

  return { total, distribution, profiles, average, scoreMin: min, scoreMax: max };
}

function broadcast(stats) {
  const payload = `data: ${JSON.stringify(stats)}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch (e) { clients.delete(res); }
  });
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Config (public read — needed by index.html)
app.get('/config', (req, res) => res.json(config));

// Config write (admin only — same "security" model as /reset)
app.put('/config', (req, res) => {
  const newCfg = req.body;
  if (!newCfg || !Array.isArray(newCfg.questions) || !newCfg.profiles) {
    return res.status(400).json({ error: 'Config invalide' });
  }
  config = newCfg;
  saveConfig(config);
  broadcast(getStats());
  console.log('⚙️  Configuration mise à jour');
  res.json({ success: true });
});

// Server-Sent Events
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

// Score submission
app.post('/submit', (req, res) => {
  const score = parseInt(req.body.score, 10);
  const { min, max } = scoreRange();

  if (!Number.isInteger(score) || score < min || score > max) {
    return res.status(400).json({ error: `Score invalide (doit être entre ${min} et ${max})` });
  }

  scores.push(score);
  const stats = getStats();
  broadcast(stats);

  const below = scores.filter(s => s < score).length;
  const percentile = Math.round((below / scores.length) * 100);

  res.json({ success: true, stats, percentile });
});

// Current stats
app.get('/stats', (req, res) => res.json(getStats()));

// Admin page (private URL)
app.get('/admin-adn-1234', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Reset
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
