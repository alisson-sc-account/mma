/* Nivel dos lutadores e sorteio justo de confrontos. Funcoes puras, sem I/O. */

const ARTS = ['jiujitsu', 'boxe', 'kickboxing', 'muaythai', 'capoeira'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Arte de maior nota dada pelo admin (empate: a primeira na ordem das artes do cadastro). */
function topScored(reg) {
  const scores = reg.scores || {};
  let best = null;
  let top = 0;
  (reg.arts || []).forEach((a) => {
    const s = Number(scores[a]) || 0;
    if (s > top) { best = a; top = s; }
  });
  return best;
}

/**
 * Arte do boneco do perfil. Quem define e o admin: ou ele escolhe (reg.doll), ou vale a arte de maior nota.
 * O que o amigo marca no cadastro, o apelido e o sobrenome nao influenciam. Antes da aprovacao nao ha boneco.
 */
function bestArt(reg) {
  if (reg.status !== 'approved') return null;
  const arts = reg.arts || [];
  if (reg.doll && arts.includes(reg.doll)) return reg.doll;
  return topScored(reg) || arts[0] || null;
}

/** Nivel geral de 0 a 100: habilidade nas artes (55%), forca (25%) e porte fisico (20%). */
function rating(reg) {
  const vals = Object.values(reg.scores || {}).map(Number).filter((n) => n > 0);
  const best = vals.length ? Math.max(...vals) : 1;
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 1;
  const skill = (0.6 * best + 0.4 * avg) / 10;
  const strength = clamp((Number(reg.strength) || 1) / 15, 0, 1);
  const size = 0.7 * clamp(((Number(reg.weight) || 60) - 45) / 65, 0, 1) + 0.3 * clamp(((Number(reg.height) || 165) - 150) / 45, 0, 1);
  return Math.round(1000 * (0.55 * skill + 0.25 * strength + 0.2 * size)) / 10;
}

/** Custo de um confronto: quanto menor, mais justo. */
function pairCost(a, b, ctx) {
  const diff = Math.abs(a.rating - b.rating);
  const kg = Math.max(0, Math.abs((a.weight || 0) - (b.weight || 0)) - 6) * 1.2;
  const pts = Math.abs((ctx.points[a.id] || 0) - (ctx.points[b.id] || 0)) * 4;
  const rematch = ctx.played.has(pairKey(a.id, b.id)) ? 1000 : 0;
  return diff + kg + pts + rematch;
}

function solveExact(c, n) {
  const full = (1 << n) - 1;
  const dp = new Float64Array(1 << n).fill(-1);
  const ch = new Int16Array(1 << n);
  function go(mask) {
    if (mask === full) return 0;
    if (dp[mask] >= 0) return dp[mask];
    let i = 0;
    while (mask & (1 << i)) i++;
    let best = Infinity;
    let bj = -1;
    for (let j = i + 1; j < n; j++) {
      if (mask & (1 << j)) continue;
      const v = c[i][j] + go(mask | (1 << i) | (1 << j));
      if (v < best) { best = v; bj = j; }
    }
    dp[mask] = best;
    ch[mask] = bj;
    return best;
  }
  go(0);
  const pairs = [];
  let mask = 0;
  while (mask !== full) {
    let i = 0;
    while (mask & (1 << i)) i++;
    const j = ch[mask];
    pairs.push([i, j]);
    mask |= (1 << i) | (1 << j);
  }
  return pairs;
}

function solveGreedy(c, n, order) {
  let pairs = [];
  for (let k = 0; k + 1 < n; k += 2) pairs.push([order[k], order[k + 1]]);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let x = 0; x < pairs.length; x++) {
      for (let y = x + 1; y < pairs.length; y++) {
        const [a, b] = pairs[x];
        const [p, q] = pairs[y];
        const cur = c[a][b] + c[p][q];
        if (c[a][p] + c[b][q] < cur - 1e-9) { pairs[x] = [a, p]; pairs[y] = [b, q]; improved = true; }
        else if (c[a][q] + c[b][p] < cur - 1e-9) { pairs[x] = [a, q]; pairs[y] = [b, p]; improved = true; }
      }
    }
  }
  return pairs;
}

/**
 * Forma os pares mais justos entre `list` ([{id, rating, weight}]), que deve ter tamanho par.
 * ctx = { points: {id: n}, played: Set de pairKey }.
 */
function pairUp(list, ctx) {
  const n = list.length;
  if (n < 2) return [];
  const c = list.map((a) => list.map((b) => (a === b ? 0 : pairCost(a, b, ctx))));
  const idx = n <= 18
    ? solveExact(c, n)
    : solveGreedy(c, n, list.map((_, i) => i).sort((i, j) => list[j].rating - list[i].rating));
  return idx
    .map(([i, j]) => [list[i], list[j]])
    .sort((p, q) => p[0].rating + p[1].rating - (q[0].rating + q[1].rating)) // luta principal por ultimo
    .map(([a, b]) => [a.id, b.id]);
}

/** Adversarios justos para um lutador: ate k opcoes proximas do melhor custo (para a roleta sortear entre elas). */
function candidates(fighter, others, ctx, k = 4) {
  const scored = others
    .filter((o) => o.id !== fighter.id)
    .map((o) => ({ id: o.id, cost: pairCost(fighter, o, ctx) }))
    .sort((a, b) => a.cost - b.cost);
  const fresh = scored.filter((s) => s.cost < 1000);
  const pool = fresh.length ? fresh : scored;
  if (!pool.length) return [];
  const limit = pool[0].cost + Math.max(8, pool[0].cost * 0.5);
  const minimum = Math.min(3, pool.length); // a segunda roleta sempre tem graça: os 3 mais próximos entram
  return pool.filter((s, i) => i < minimum || s.cost <= limit).slice(0, k);
}

/** Quantas rodadas de classificacao cabem no tempo, e qual o formato dos playoffs. */
function plan(n, cfg) {
  const slot = (Number(cfg.fightMin) || 7.5) + (Number(cfg.restMin) || 0);
  const budget = Math.max(1, Math.floor((Number(cfg.totalMin) || 210) / slot));
  const playoff = n >= 6 ? 'top4' : n >= 4 ? 'final' : 'none';
  const playoffFights = playoff === 'top4' ? 3 : playoff === 'final' ? 1 : 0;
  const perRound = Math.max(1, Math.floor(n / 2));
  const maxRounds = Math.max(1, n % 2 ? n : n - 1); // ímpar: todos contra todos exige n rodadas por causa do descanso
  let rounds = Number(cfg.swissRounds) > 0
    ? Number(cfg.swissRounds)
    : clamp(Math.floor((budget - playoffFights) / perRound), 1, 3);
  rounds = clamp(rounds, 1, maxRounds);
  const odd = n % 2 === 1;
  const swissFights = rounds * perRound + (odd && rounds === 1 ? 1 : 0);
  const totalFights = swissFights + playoffFights;
  const estMinutes = Math.round(totalFights * slot);
  const warnings = [];
  if (n < 2) warnings.push('Precisa de pelo menos 2 lutadores.');
  if (totalFights > budget) warnings.push(`Passa do tempo: ${totalFights} lutas, cabem ${budget}. Aumente a duração total ou tire lutadores.`);
  if (odd) warnings.push(rounds === 1
    ? 'Número ímpar: um lutador faz uma luta extra para ninguém ficar sem lutar.'
    : 'Número ímpar: em cada rodada um lutador descansa (nunca o mesmo duas vezes).');
  return { n, rounds, playoff, playoffFights, swissFights, totalFights, estMinutes, budget, slot, warnings };
}

module.exports = { ARTS, bestArt, topScored, rating, pairCost, pairUp, candidates, plan, pairKey };
