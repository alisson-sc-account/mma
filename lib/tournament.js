/* Motor do torneio: rodadas suicas balanceadas + playoffs. Opera sobre o objeto `state`. */
const mm = require('./matchmaking');

const METHODS = ['KO', 'Finalização', 'Decisão', 'WO'];
const uid = () => Math.random().toString(36).slice(2, 9);
const allFights = (t) => t.rounds.flatMap((r) => r.fights);
const swissRounds = (t) => t.rounds.filter((r) => r.type === 'swiss');

function currentRound(t) { return t.rounds[t.rounds.length - 1] || null; }

function fighterList(state) {
  return state.tournament.fighters.map((id) => {
    const r = state.regs[id];
    return { id, rating: mm.rating(r), weight: r.weight };
  });
}

function standings(state) {
  const t = state.tournament;
  const byId = {};
  fighterList(state).forEach((f) => { byId[f.id] = { id: f.id, played: 0, wins: 0, losses: 0, points: 0, opp: 0, rating: f.rating }; });
  swissRounds(t).forEach((r) => r.fights.forEach((f) => {
    if (!f.winner) return;
    const loser = f.winner === f.a ? f.b : f.a;
    [f.a, f.b].forEach((id) => { byId[id].played++; });
    byId[f.winner].wins++;
    byId[f.winner].points += 3;
    byId[f.winner].opp += byId[loser].rating;
    byId[loser].losses++;
  }));
  return Object.values(byId).sort((a, b) => b.points - a.points || b.opp - a.opp || b.rating - a.rating);
}

function pairingContext(state) {
  const t = state.tournament;
  const points = {};
  swissRounds(t).forEach((r) => r.fights.forEach((f) => { if (f.winner) points[f.winner] = (points[f.winner] || 0) + 3; }));
  const played = new Set(allFights(t).map((f) => mm.pairKey(f.a, f.b)));
  return { points, played };
}

function unpaired(t, round) {
  const used = new Set();
  round.fights.forEach((f) => { if (!f.extra) { used.add(f.a); used.add(f.b); } });
  round.byes.forEach((id) => used.add(id));
  if (round.extra) used.add(round.extra);
  return t.fighters.filter((id) => !used.has(id));
}

function newFight(t, a, b, extra) {
  return { id: uid(), a, b, winner: null, method: null, order: t.nextOrder++, extra: !!extra };
}

function startTournament(state) {
  const fighters = Object.values(state.regs).filter((r) => r.status === 'approved' && r.role === 'fighter').map((r) => r.id);
  if (fighters.length < 2) throw new Error('Aprove pelo menos 2 lutadores antes de começar.');
  const p = mm.plan(fighters.length, state.settings);
  state.tournament = { fighters, K: p.rounds, playoff: p.playoff, phase: 'swiss', rounds: [], champion: null, nextOrder: 1, startedAt: Date.now() };
  newSwissRound(state);
}

function newSwissRound(state) {
  const t = state.tournament;
  const n = t.fighters.length;
  const num = swissRounds(t).length + 1;
  const round = { id: uid(), n: num, type: 'swiss', name: `Rodada ${num}`, fights: [], byes: [], extra: null };
  if (n % 2 === 1) {
    const byeCount = (id) => t.rounds.filter((r) => r.byes.includes(id)).length;
    const min = Math.min(...t.fighters.map(byeCount));
    const pool = t.fighters.filter((id) => byeCount(id) === min);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (t.K === 1) round.extra = pick; else round.byes.push(pick);
  }
  t.rounds.push(round);
  return round;
}

function fillExtra(state, round) {
  const t = state.tournament;
  if (!round.extra || round.fights.some((f) => f.extra)) return;
  const fl = fighterList(state);
  const me = fl.find((f) => f.id === round.extra);
  const cands = mm.candidates(me, fl, pairingContext(state), 3);
  const pick = cands[Math.floor(Math.random() * cands.length)];
  if (pick) round.fights.push(newFight(t, round.extra, pick.id, true));
}

function openRound(state) {
  const t = state.tournament;
  const r = currentRound(t);
  if (!t || t.phase !== 'swiss' || !r || r.type !== 'swiss') throw new Error('Não há rodada de classificação aberta.');
  return r;
}

function pairFight(state, a, b) {
  const t = state.tournament;
  const round = openRound(state);
  const free = unpaired(t, round);
  if (a === b || !free.includes(a) || !free.includes(b)) throw new Error('Esses dois já têm luta nesta rodada.');
  round.fights.push(newFight(t, a, b, false));
  if (!unpaired(t, round).length) fillExtra(state, round);
}

function autoPair(state) {
  const t = state.tournament;
  const round = openRound(state);
  const free = new Set(unpaired(t, round));
  const list = fighterList(state).filter((f) => free.has(f.id));
  mm.pairUp(list.length % 2 ? list.slice(0, -1) : list, pairingContext(state)).forEach(([a, b]) => {
    round.fights.push(newFight(t, a, b, false));
  });
  if (!unpaired(t, round).length) fillExtra(state, round);
}

function candidatesFor(state, fighterId) {
  const t = state.tournament;
  const round = openRound(state);
  const free = new Set(unpaired(t, round));
  const fl = fighterList(state).filter((f) => free.has(f.id));
  const me = fl.find((f) => f.id === fighterId);
  if (!me) throw new Error('Lutador já tem luta nesta rodada.');
  return mm.candidates(me, fl, pairingContext(state), 4);
}

function removeFight(state, fightId) {
  const t = state.tournament;
  const round = t.rounds.find((r) => r.fights.some((f) => f.id === fightId));
  if (!round) throw new Error('Luta não encontrada.');
  if (round !== currentRound(t)) throw new Error('Só dá para desfazer luta da rodada atual.');
  const f = round.fights.find((x) => x.id === fightId);
  if (f.winner) throw new Error('Essa luta já tem resultado. Limpe o resultado primeiro.');
  round.fights = round.fights.filter((x) => x.id !== fightId);
}

function setResult(state, fightId, winner, method) {
  const t = state.tournament;
  const f = allFights(t).find((x) => x.id === fightId);
  if (!f) throw new Error('Luta não encontrada.');
  if (winner && winner !== f.a && winner !== f.b) throw new Error('Vencedor inválido.');
  const round = t.rounds.find((r) => r.fights.includes(f));
  if (round !== currentRound(t)) throw new Error('Só dá para mudar o resultado da rodada atual.');
  f.winner = winner || null;
  f.method = winner && METHODS.includes(method) ? method : null;
}

function roundComplete(t, round) {
  if (!round || !round.fights.length) return false;
  if (round.type === 'swiss' && unpaired(t, round).length) return false;
  if (round.extra && !round.fights.some((f) => f.extra)) return false;
  return round.fights.every((f) => f.winner);
}

function advance(state) {
  const t = state.tournament;
  const round = currentRound(t);
  if (!roundComplete(t, round)) throw new Error('Termine os sorteios e registre todos os resultados antes de avançar.');
  const rank = standings(state).map((s) => s.id);

  if (round.type === 'swiss') {
    if (swissRounds(t).length < t.K) { newSwissRound(state); return; }
    if (t.playoff === 'none') { t.champion = rank[0]; t.phase = 'finished'; return; }
    t.phase = 'playoffs';
    if (t.playoff === 'top4') {
      t.rounds.push({ id: uid(), n: 1, type: 'semi', name: 'Semifinais', byes: [], extra: null, fights: [newFight(t, rank[0], rank[3]), newFight(t, rank[1], rank[2])] });
    } else {
      t.rounds.push({ id: uid(), n: 1, type: 'final', name: 'Final', byes: [], extra: null, fights: [newFight(t, rank[0], rank[1])] });
    }
    return;
  }
  if (round.type === 'semi') {
    t.rounds.push({ id: uid(), n: 1, type: 'final', name: 'Final', byes: [], extra: null, fights: [newFight(t, round.fights[0].winner, round.fights[1].winner)] });
    return;
  }
  t.champion = round.fights[0].winner;
  t.phase = 'finished';
}

/** Visao publica (sem notas de nivel). */
function publicView(state) {
  const t = state.tournament;
  if (!t) return null;
  const round = currentRound(t);
  return {
    phase: t.phase, K: t.K, playoff: t.playoff, champion: t.champion, fighters: t.fighters,
    rounds: t.rounds.map((r) => ({
      id: r.id, n: r.n, type: r.type, name: r.name, byes: r.byes, extra: r.extra,
      pending: r === round && r.type === 'swiss' ? unpaired(t, r) : [],
      fights: r.fights.map((f) => ({ id: f.id, a: f.a, b: f.b, winner: f.winner, method: f.method, order: f.order, extra: f.extra })),
    })),
    currentId: round ? round.id : null,
    canAdvance: roundComplete(t, round) && t.phase !== 'finished',
    standings: standings(state).map(({ id, played, wins, losses, points }) => ({ id, played, wins, losses, points })),
  };
}

module.exports = { METHODS, startTournament, pairFight, autoPair, candidatesFor, removeFight, setResult, advance, publicView, standings, fighterList };
