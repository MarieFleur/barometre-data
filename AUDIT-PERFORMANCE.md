# Audit de Performance — Baromètre de Maturité Data

**Date** : 2026-03-24
**Question** : L'application peut-elle supporter 500 utilisateurs simultanés ?

---

## Verdict

**Oui, mais avec des réserves.** L'architecture actuelle (Node.js single-thread, stockage in-memory, SSE) peut techniquement gérer 500 utilisateurs, mais présente des goulots d'étranglement qui peuvent causer des latences ou des timeouts sous charge.

---

## Problèmes identifiés

### 🔴 Critique

| # | Problème | Fichier | Impact |
|---|----------|---------|--------|
| 1 | **Broadcast O(n×m)** : chaque soumission déclenche un `broadcast()` vers TOUS les clients SSE. 500 soumissions simultanées = 250 000 écritures. | `server.js:32-37, 67-69` | Saturation du event loop, latence généralisée |
| 2 | **Aucun rate limiting** : `POST /submit` n'a aucune protection. Le code client gère le 429, mais le serveur ne le renvoie jamais. | `server.js:59-75` | Abus possible, pollution des données, DoS facile |
| 3 | **Admin sans authentification** : `/admin-adn-1234` et `POST /reset` accessibles à tous. | `server.js:81-92` | Suppression des données par n'importe qui |

### 🟡 Modéré

| # | Problème | Fichier | Impact |
|---|----------|---------|--------|
| 4 | **`getStats()` recalcule tout** à chaque appel (5 parcours du tableau `scores[]`). | `server.js:12-30` | Inefficace à grande échelle, bloque le thread |
| 5 | **Pas de clustering** : un seul processus Node.js. | `server.js:94-98` | Pas de résilience, pas d'utilisation multi-cœur |
| 6 | **Reconnection storm SSE** : si le serveur lag, 500 clients EventSource se reconnectent ensemble. | `public/index.html:857-864` | Pic de charge soudain |
| 7 | **500 timers `setInterval`** pour les pings SSE (un par client). | `server.js:51-52` | Pression mémoire et event loop |

### 🟢 Mineur / Contextuel

| # | Problème | Fichier | Impact |
|---|----------|---------|--------|
| 8 | **Pas de persistence** : données en mémoire uniquement. | `server.js:9` | Perte de données au restart |
| 9 | **Pas de CORS** configuré. | `server.js` | Risque si déployé derrière un autre domaine |
| 10 | **Dépendance CDN** : Chart.js chargé depuis jsdelivr. | `public/index.html:7` | Si le CDN tombe, pas de graphiques |

---

## Estimations de charge

### Scénario : 500 utilisateurs remplissent le questionnaire en 2 minutes

| Métrique | Valeur |
|----------|--------|
| Connexions HTTP simultanées | ~500 (SSE) + bursts POST |
| Limite Node.js (défaut) | ~16 384 connexions |
| Mémoire pour 500 scores (tableau) | < 1 Ko |
| Mémoire pour 500 connexions SSE | ~50-100 Mo (buffers HTTP) |
| Temps de `getStats()` pour 500 entrées | < 1 ms |
| Temps de `broadcast()` vers 500 clients | ~5-20 ms |
| Burst worst-case (500 POST en 1s) | 500 × broadcast(500) = 250 000 writes |

### Conclusion

Le **cas nominal** (soumissions étalées sur 2 min) passera sans problème.
Le **burst simultané** (tous soumettent en même temps) peut causer 1-3s de latence.

---

## Recommandations

### Priorité 1 — Indispensable pour 500 utilisateurs

1. **Debounce le broadcast** : au lieu de broadcaster à chaque `POST /submit`, accumuler les changements et broadcaster toutes les 200-500ms maximum.

2. **Cache `getStats()`** : maintenir un objet stats incrémental au lieu de recalculer à chaque fois.

3. **Rate limiter `POST /submit`** : 1 soumission par IP (ou par session), avec réponse 429.

### Priorité 2 — Recommandé

4. **Protéger l'admin** : ajouter un token/mot de passe sur `/reset` et `/admin-*`.

5. **Backoff SSE côté client** : ajouter un délai exponentiel sur reconnection pour éviter les storms.

6. **Cluster mode** : utiliser PM2 ou le module `cluster` de Node.js pour exploiter tous les cœurs CPU.

### Priorité 3 — Nice to have

7. **Persistence** : sauvegarder les scores dans un fichier JSON ou SQLite.

8. **Servir Chart.js localement** au lieu du CDN.

9. **Ajouter des health checks** et du monitoring.
