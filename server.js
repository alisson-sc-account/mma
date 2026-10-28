const path = require('path');
const crypto = require('crypto');
const express = require('express');
const store = require('./lib/store');
const Filter = require('./public/js/filter.js');
const NICKS = require('./public/js/nicknames.js');
const device = require('./lib/device');
const mm = require('./lib/matchmaking');
const T = require('./lib/tournament');

// .env local (fica fora do git). Variaveis ja definidas no ambiente tem prioridade.
try {
  require('fs').readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (e) { /* sem .env, tudo bem */ }

const PORT = process.env.PORT || 3000;
const FOOD = ['Refrigerante', 'Salgadinho', 'Água', 'Gelo', 'Copos e pratos', 'Doce ou bolo', 'Outros'];
const NICK_SET = new Set(NICKS.map((n) => n[0]));

// A senha do admin vem do ambiente. Nunca vai para o frontend nem fica escrita no codigo.
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = crypto.randomBytes(4).toString('hex');
  console.warn(`\n[aviso] ADMIN_PASSWORD não definida. Senha temporária do admin nesta execução: ${ADMIN_PASSWORD}\n`);
}

let state;
const photos = new Map();

const DEFAULT_SETTINGS = {
  whatsapp: (process.env.WHATSAPP_NUMBER || '5538998531018').replace(/\D/g, ''),
  place: 'Casa do Nathan', startTime: '14:30',
  pizzaTotal: 240, extraPeople: 0,
  fightMin: 7.5, restMin: 2, totalMin: 210, swissRounds: 0,
};

async function load() {
  await store.init();
  if (store.mode === 'arquivo' && (process.env.RENDER || process.env.NODE_ENV === 'production')) {
    console.warn('\n[aviso] Sem DATABASE_URL: os dados ficam em arquivo e SÃO PERDIDOS quando o servidor reinicia. Configure um Postgres (ex.: Neon).\n');
  }
  state = (await store.get('state')) || {};
  state.v = state.v || 1;
  state.regs = state.regs || {};
  state.sessions = state.sessions || {};
  state.tournament = state.tournament || null;
  state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings || {});
  if (process.env.WHATSAPP_NUMBER) state.settings.whatsapp = process.env.WHATSAPP_NUMBER.replace(/\D/g, '');
}

let saving = Promise.resolve();
function save() {
  state.v++;
  saving = saving.then(() => store.set('state', state)).catch((e) => console.error('save', e));
  return saving;
}

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '3mb' }));

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (e && e.status) return res.status(e.status).json({ error: e.message, field: e.field });
  if (e instanceof Error && e.message && !e.stack.includes('node_modules')) return res.status(400).json({ error: e.message });
  console.error(e);
  res.status(500).json({ error: 'Erro interno.' });
});
const fail = (status, message, field) => Object.assign(new Error(message), { status, field });

function session(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  return m ? state.sessions[m[1]] || null : null;
}
const needAdmin = (req) => { const s = session(req); if (!s || s.type !== 'admin') throw fail(401, 'Entre como admin.'); };
const needUser = (req) => {
  const s = session(req);
  if (!s || s.type !== 'user' || !state.regs[s.id]) throw fail(401, 'Entre na sua conta.');
  return state.regs[s.id];
};
function newSession(type, id) {
  const token = crypto.randomBytes(24).toString('hex');
  state.sessions[token] = { type, id, at: Date.now() };
  return token;
}

const uname = (s) => String(s || '').trim().toLowerCase();
const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
const nameOk = /^[\p{L}][\p{L} '.-]*$/u;
const userOk = /^[\p{L}\p{N}._-]+$/u;

function foodList(raw, other) {
  const list = (Array.isArray(raw) ? raw : []).filter((f) => FOOD.includes(f));
  if (!list.length) throw fail(400, 'Marque pelo menos uma coisa que você vai levar.', 'food');
  const o = clean(other, 60);
  if (list.includes('Outros') && o.length < 3) throw fail(400, 'Em "Outros", escreva o que você vai levar.', 'foodOther');
  const bad = Filter.check(o);
  if (bad) throw fail(400, 'Sem zoeira no cadastro. Escreva sério.', 'foodOther');
  return { food: list, foodOther: list.includes('Outros') ? o : '' };
}

function ipOf(req) { return String(req.ip || '').replace(/^::ffff:/, ''); }

function peopleCount() {
  return Object.values(state.regs).filter((r) => r.status === 'approved').length + (Number(state.settings.extraPeople) || 0);
}

function publicPerson(r) {
  return {
    id: r.id, firstName: r.firstName, lastName: r.lastName, nickname: r.nickname, arts: r.arts,
    bestArt: mm.bestArt(r), role: r.role, food: r.food, foodOther: r.foodOther, photoV: r.photoV,
  };
}

function ownView(r) {
  return {
    id: r.id, username: r.username, password: r.password, firstName: r.firstName, lastName: r.lastName, nickname: r.nickname,
    arts: r.arts, bestArt: mm.bestArt(r), food: r.food, foodOther: r.foodOther,
    status: r.status, role: r.role, code: r.status === 'pending' ? r.code : null, photoV: r.photoV,
  };
}

// ---------- Publico ----------

app.get('/api/public', (req, res) => {
  if (String(req.query.v) === String(state.v)) return res.json({ unchanged: true, v: state.v });
  const regs = Object.values(state.regs);
  const s = state.settings;
  res.json({
    v: state.v,
    config: { whatsapp: s.whatsapp, place: s.place, startTime: s.startTime, pizzaTotal: s.pizzaTotal, extraPeople: s.extraPeople, fightMin: s.fightMin, restMin: s.restMin, people: peopleCount() },
    foodOptions: FOOD,
    takenNicks: regs.filter((r) => r.nickname && r.status !== 'rejected').map((r) => r.nickname),
    pending: regs.filter((r) => r.status === 'pending').length,
    plan: planPreview(),
    people: regs.filter((r) => r.status === 'approved').sort((a, b) => a.createdAt - b.createdAt).map(publicPerson),
    tournament: T.publicView(state),
  });
});

app.get('/api/check', (req, res) => {
  const u = clean(req.query.username, 30);
  if (u.length < 3) return res.json({ ok: false, reason: 'Mínimo de 3 caracteres.' });
  if (!userOk.test(u)) return res.json({ ok: false, reason: 'Use só letras, números, ponto, traço ou _.' });
  if (Filter.check(u)) return res.json({ ok: false, reason: 'Sem zoeira. Escolha um nome de usuário sério.' });
  const taken = Object.values(state.regs).some((r) => r.status !== 'rejected' && uname(r.username) === uname(u));
  res.json(taken ? { ok: false, reason: 'Esse usuário já existe.' } : { ok: true });
});

app.get('/api/photo/:id', async (req, res) => {
  const r = state.regs[req.params.id];
  if (!r) return res.status(404).end();
  let data = photos.get(r.id);
  if (!data) { data = await store.get(`photo:${r.id}`); if (data) photos.set(r.id, data); }
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(data || '');
  if (!m) return res.status(404).end();
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.send(Buffer.from(m[1], 'base64'));
});

app.post('/api/register', wrap(async (req, res) => {
  const b = req.body || {};
  const username = clean(b.username, 24);
  const firstName = clean(b.firstName, 24);
  const lastName = clean(b.lastName, 24);
  const nickname = clean(b.nickname, 40);
  const password = String(b.password == null ? '' : b.password).slice(0, 100);

  if (username.length < 3 || !userOk.test(username)) throw fail(400, 'Nome de usuário: mínimo 3 caracteres, só letras, números, ponto, traço ou _.', 'username');
  if (Object.values(state.regs).some((r) => r.status !== 'rejected' && uname(r.username) === uname(username))) throw fail(409, 'Esse usuário já existe.', 'username');
  if (firstName.length < 2 || !nameOk.test(firstName)) throw fail(400, 'O primeiro nome é obrigatório.', 'firstName');
  if (lastName && !nameOk.test(lastName)) throw fail(400, 'Sobrenome inválido. Ele é opcional, pode deixar em branco.', 'lastName');
  if (!password) throw fail(400, 'Crie uma senha. Pode ser qualquer uma.', 'password');
  const bad = Filter.checkAll({ username, firstName, lastName });
  if (bad) throw fail(400, 'Sem zoeira no cadastro. Escreva sério.', bad.field);

  if (nickname) {
    if (!NICK_SET.has(nickname)) throw fail(400, 'Escolha um apelido da lista.', 'nickname');
    if (Object.values(state.regs).some((r) => r.status !== 'rejected' && r.nickname === nickname)) throw fail(409, 'Esse apelido já foi escolhido por outro lutador.', 'nickname');
  }
  const arts = [...new Set(Array.isArray(b.arts) ? b.arts : [])].filter((a) => mm.ARTS.includes(a));
  if (arts.length < 2) throw fail(400, 'Escolha pelo menos 2 artes marciais.', 'arts');
  const f = foodList(b.food, b.foodOther);
  const photo = String(b.photo || '');
  if (!/^data:image\/jpeg;base64,/.test(photo) || photo.length < 3000) throw fail(400, 'A foto sua é obrigatória.', 'photo');
  if (photo.length > 900000) throw fail(400, 'Foto grande demais. Tente outra.', 'photo');

  const id = crypto.randomBytes(5).toString('hex');
  let code;
  do { code = String(crypto.randomInt(100000, 1000000)); } while (Object.values(state.regs).some((r) => r.code === code));
  const dev = b.device && typeof b.device === 'object' ? b.device : {};
  const ip = ipOf(req);
  state.regs[id] = {
    id, username, firstName, lastName, nickname, password, arts, doll: null, food: f.food, foodOther: f.foodOther,
    code, status: 'pending', role: null, scores: {}, strength: null, weight: null, height: null,
    device: dev, deviceId: clean(dev.deviceId, 60), deviceInfo: device.describe(dev, ip), ip, createdAt: Date.now(), photoV: 1,
  };
  photos.set(id, photo);
  await store.set(`photo:${id}`, photo);
  await save();
  res.json({ token: newSession('user', id), me: ownView(state.regs[id]) });
}));

app.post('/api/login', wrap(async (req, res) => {
  const u = uname(req.body && req.body.username);
  const reg = Object.values(state.regs).find((r) => uname(r.username) === u && r.status !== 'rejected') ||
    Object.values(state.regs).find((r) => uname(r.username) === u);
  if (!reg || reg.password !== String((req.body && req.body.password) || '')) throw fail(401, 'Usuário ou senha incorretos.');
  const token = newSession('user', reg.id);
  await save();
  res.json({ token, me: ownView(reg) });
}));

app.get('/api/me', wrap(async (req, res) => { res.json({ me: ownView(needUser(req)) }); }));

app.put('/api/me/food', wrap(async (req, res) => {
  const r = needUser(req);
  const f = foodList(req.body.food, req.body.foodOther);
  r.food = f.food;
  r.foodOther = f.foodOther;
  await save();
  res.json({ me: ownView(r) });
}));

// ---------- Admin ----------

const loginFails = new Map(); // ip -> {n, until}: 8 erros seguidos travam por 5 minutos
app.post('/api/admin/login', wrap(async (req, res) => {
  const ip = ipOf(req);
  const f = loginFails.get(ip) || { n: 0, until: 0 };
  if (f.until > Date.now()) throw fail(429, 'Muitas tentativas erradas. Espere uns 5 minutos.');
  const given = String((req.body && req.body.password) || '');
  const a = Buffer.from(given);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    f.n++;
    if (f.n >= 8) { f.until = Date.now() + 5 * 60000; f.n = 0; }
    loginFails.set(ip, f);
    throw fail(401, 'Senha do admin incorreta.');
  }
  loginFails.delete(ip);
  const token = newSession('admin', 'admin');
  await save();
  res.json({ token });
}));

function adminReg(r, all) {
  const same = all.filter((o) => o.id !== r.id);
  return {
    ...r,
    bestArt: mm.bestArt(r),
    rating: r.role === 'fighter' ? mm.rating(r) : null,
    dups: {
      sameDevice: same.filter((o) => r.deviceId && o.deviceId === r.deviceId).map((o) => o.username),
      lookAlike: same.filter((o) => !(r.deviceId && o.deviceId === r.deviceId) && o.deviceInfo.label === r.deviceInfo.label && o.ip === r.ip && JSON.stringify(o.device.screen) === JSON.stringify(r.device.screen)).map((o) => o.username),
      sameName: same.filter((o) => o.firstName.toLowerCase() === r.firstName.toLowerCase() && (o.lastName || '').toLowerCase() === (r.lastName || '').toLowerCase()).map((o) => o.username),
    },
    device: undefined,
  };
}

function planPreview() {
  const n = Object.values(state.regs).filter((r) => r.status === 'approved' && r.role === 'fighter').length;
  return mm.plan(n, state.settings);
}

app.get('/api/admin/state', wrap(async (req, res) => {
  needAdmin(req);
  const all = Object.values(state.regs);
  res.json({
    v: state.v, settings: state.settings, regs: all.sort((a, b) => b.createdAt - a.createdAt).map((r) => adminReg(r, all)),
    plan: planPreview(), tournament: T.publicView(state),
    ratings: state.tournament ? Object.fromEntries(T.fighterList(state).map((f) => [f.id, f.rating])) : {},
  });
}));

function locked(r) { return !!(state.tournament && state.tournament.fighters.includes(r.id)); }

app.post('/api/admin/reg/:id/approve', wrap(async (req, res) => {
  needAdmin(req);
  const r = state.regs[req.params.id];
  if (!r) throw fail(404, 'Cadastro não encontrado.');
  const b = req.body || {};
  const role = b.role === 'fighter' ? 'fighter' : 'spectator';
  if (locked(r) && role !== 'fighter') throw fail(400, 'Esse lutador já está no torneio. Reinicie o torneio para mudar.');
  if (role === 'fighter') {
    const scores = {};
    r.arts.forEach((a) => {
      const n = Math.round(Number(b.scores && b.scores[a]));
      if (!(n >= 1 && n <= 10)) throw fail(400, `Dê uma nota de 1 a 10 para ${a}.`);
      scores[a] = n;
    });
    const strength = Math.round(Number(b.strength));
    const weight = Math.round(Number(b.weight) * 10) / 10;
    const height = Math.round(Number(b.height));
    if (!(strength >= 1 && strength <= 15)) throw fail(400, 'Força: de 1 a 15.');
    if (!(weight >= 30 && weight <= 200)) throw fail(400, 'Peso aproximado em kg (30 a 200).');
    if (!(height >= 120 && height <= 230)) throw fail(400, 'Altura em cm (120 a 230).');
    Object.assign(r, { scores, strength, weight, height });
  }
  // O boneco do perfil e decisao do admin: o que ele escolher, ou a arte de maior nota.
  r.doll = r.arts.includes(b.doll) ? b.doll : null; // null = vale a arte de maior nota
  r.role = role;
  r.status = 'approved';
  await save();
  res.json({ ok: true });
}));

app.post('/api/admin/reg/:id/:action(reject|pending)', wrap(async (req, res) => {
  needAdmin(req);
  const r = state.regs[req.params.id];
  if (!r) throw fail(404, 'Cadastro não encontrado.');
  if (locked(r)) throw fail(400, 'Esse lutador já está no torneio. Reinicie o torneio primeiro.');
  r.status = req.params.action === 'reject' ? 'rejected' : 'pending';
  r.role = null;
  await save();
  res.json({ ok: true });
}));

app.delete('/api/admin/reg/:id', wrap(async (req, res) => {
  needAdmin(req);
  const r = state.regs[req.params.id];
  if (!r) throw fail(404, 'Cadastro não encontrado.');
  if (locked(r)) throw fail(400, 'Esse lutador já está no torneio. Reinicie o torneio primeiro.');
  delete state.regs[r.id];
  photos.delete(r.id);
  await store.del(`photo:${r.id}`);
  await save();
  res.json({ ok: true });
}));

app.put('/api/admin/settings', wrap(async (req, res) => {
  needAdmin(req);
  const b = req.body || {};
  const s = state.settings;
  const num = (v, min, max, fallback) => { const n = Number(v); return n >= min && n <= max ? n : fallback; };
  if (b.whatsapp != null && !process.env.WHATSAPP_NUMBER) s.whatsapp = String(b.whatsapp).replace(/\D/g, '');
  s.pizzaTotal = num(b.pizzaTotal, 0, 5000, s.pizzaTotal);
  s.extraPeople = num(b.extraPeople, 0, 50, s.extraPeople);
  s.fightMin = num(b.fightMin, 1, 60, s.fightMin);
  s.restMin = num(b.restMin, 0, 30, s.restMin);
  s.totalMin = num(b.totalMin, 30, 600, s.totalMin);
  s.swissRounds = num(b.swissRounds, 0, 6, s.swissRounds);
  if (/^\d{1,2}:\d{2}$/.test(b.startTime || '')) s.startTime = b.startTime;
  if (b.place != null) s.place = clean(b.place, 60) || s.place;
  await save();
  res.json({ ok: true });
}));

const tournamentRoute = (fn) => wrap(async (req, res) => {
  needAdmin(req);
  fn(req);
  await save();
  res.json({ ok: true });
});
const needTournament = () => { if (!state.tournament) throw fail(400, 'O torneio ainda não começou.'); };

app.post('/api/admin/tournament/start', tournamentRoute(() => {
  if (state.tournament) throw fail(400, 'O torneio já começou.');
  T.startTournament(state);
}));
app.post('/api/admin/tournament/reset', tournamentRoute(() => { state.tournament = null; }));
app.post('/api/admin/round/pair', tournamentRoute((req) => { needTournament(); T.pairFight(state, req.body.a, req.body.b); }));
app.post('/api/admin/round/auto', tournamentRoute(() => { needTournament(); T.autoPair(state); }));
app.post('/api/admin/round/next', tournamentRoute(() => { needTournament(); T.advance(state); }));
app.delete('/api/admin/fight/:id', tournamentRoute((req) => { needTournament(); T.removeFight(state, req.params.id); }));
app.post('/api/admin/fight/:id/result', tournamentRoute((req) => { needTournament(); T.setResult(state, req.params.id, req.body.winner, req.body.method); }));

app.get('/api/admin/candidates', wrap(async (req, res) => {
  needAdmin(req);
  needTournament();
  res.json({ candidates: T.candidatesFor(state, String(req.query.fighter)) });
}));

// ---------- Site ----------

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders: (res, file) => { if (/\.html$/.test(file)) res.set('Cache-Control', 'no-cache'); else res.set('Cache-Control', 'public, max-age=300'); },
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

if (require.main === module) {
  load().then(() => {
    app.listen(PORT, () => console.log(`Octógono Sexta no ar na porta ${PORT} (armazenamento: ${store.mode})`));
  }).catch((e) => { console.error('Falha ao iniciar', e); process.exit(1); });
}

module.exports = { app, load };
