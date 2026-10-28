/* Testes sem dependencias: node test/run.js */
const assert = require('assert');
const Filter = require('../public/js/filter.js');
const mm = require('../lib/matchmaking');
const T = require('../lib/tournament');
const device = require('../lib/device');

let failures = 0;
const ok = (name, fn) => { try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FALHA', name, '\n       ', e.message); } };

console.log('\nFiltro de zoeira');
['pinto', 'P1nt0', 'p i n t o', 'piiinto', 'pinto2008', 'rola', 'hitler', 'H1tl3r', 'caralho', 'nazista', 'heil', 'meu pinto grande', 'b u c e t a', 'puuuta']
  .forEach((w) => ok(`barra "${w}"`, () => assert(Filter.check(w), 'deveria barrar')));
['Rolando', 'Paulo', 'Matheus', 'Fernando', 'Cubas', 'Pintor', 'João Silva', 'Alisson', 'Nathan', 'Gabriel_10', 'Luiz Fernando', 'Cunha', 'Pires', 'Capoeira']
  .forEach((w) => ok(`libera "${w}"`, () => assert.strictEqual(Filter.check(w), null)));

console.log('\nAparelho');
ok('iPhone 11 x iPhone 14', () => {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
  assert(device.describe({ ua, screen: [414, 896], dpr: 2 }).label.includes('XR / 11'));
  assert(device.describe({ ua, screen: [390, 844], dpr: 3 }).label.includes('14'));
});
ok('Android com modelo', () => {
  const d = device.describe({ ua: 'Mozilla/5.0 (Linux; Android 13; SM-A515F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', screen: [412, 915], dpr: 2.6 });
  assert(d.label.includes('SM-A515F'));
});

function fakeState(n, seed) {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const regs = {};
  for (let i = 0; i < n; i++) {
    const id = 'f' + i;
    regs[id] = {
      id, status: 'approved', role: 'fighter', arts: ['boxe', 'muaythai'], bestPick: 'boxe',
      scores: { boxe: 1 + Math.floor(rnd() * 10), muaythai: 1 + Math.floor(rnd() * 10) },
      strength: 1 + Math.floor(rnd() * 15), weight: 50 + Math.floor(rnd() * 50), height: 155 + Math.floor(rnd() * 35),
    };
  }
  return { regs, tournament: null, settings: { fightMin: 7.5, restMin: 2, totalMin: 210, swissRounds: 0 } };
}

console.log('\nTorneio (simulacao completa)');
[2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 20, 25, 31].forEach((n) => ok(`${n} lutadores`, () => {
  const st = fakeState(n, n * 7 + 1);
  const plan = mm.plan(n, st.settings);
  T.startTournament(st);
  const rating = Object.fromEntries(T.fighterList(st).map((f) => [f.id, f.rating]));
  let guard = 0;
  while (st.tournament.phase !== 'finished' && guard++ < 30) {
    const round = st.tournament.rounds[st.tournament.rounds.length - 1];
    if (round.type === 'swiss') T.autoPair(st);
    round.fights.forEach((f) => T.setResult(st, f.id, rating[f.a] >= rating[f.b] ? f.a : f.b, 'Decisão'));
    T.advance(st);
  }
  const t = st.tournament;
  assert.strictEqual(t.phase, 'finished');
  assert(t.champion, 'sem campeão');
  const fights = t.rounds.flatMap((r) => r.fights);
  const count = {};
  fights.forEach((f) => { count[f.a] = (count[f.a] || 0) + 1; count[f.b] = (count[f.b] || 0) + 1; });
  t.fighters.forEach((id) => assert((count[id] || 0) >= 1, `${id} não lutou`));
  const swiss = t.rounds.filter((r) => r.type === 'swiss').flatMap((r) => r.fights);
  const keys = swiss.map((f) => mm.pairKey(f.a, f.b));
  assert.strictEqual(new Set(keys).size, keys.length, 'revanche na classificação');
  assert.strictEqual(fights.length, plan.totalFights, `lutas ${fights.length} != plano ${plan.totalFights}`);
  const gap = swiss.reduce((a, f) => a + Math.abs(rating[f.a] - rating[f.b]), 0) / swiss.length;
  console.log(`         ${fights.length} lutas, ~${plan.estMinutes} min, diferença média de nível ${gap.toFixed(1)}`);
}));

ok('roleta: candidatos justos', () => {
  const st = fakeState(10, 3);
  T.startTournament(st);
  const c = T.candidatesFor(st, 'f0');
  assert(c.length >= 1 && c.length <= 4);
  assert(!c.some((x) => x.id === 'f0'));
});

console.log(failures ? `\n${failures} falha(s)\n` : '\nTudo certo.\n');
process.exit(failures ? 1 : 0);
