/* Teste de ponta a ponta da API, sem subir processo separado: node test/api.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-'));
process.env.ADMIN_PASSWORD = 'senha-de-teste';
delete process.env.DATABASE_URL;

const assert = require('assert');
const { app, load } = require('../server');
const photo = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'boxe.jpg')).toString('base64');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1';

(async () => {
  await load();
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, url, body, token) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let json = {};
    try { json = await res.json(); } catch (e) {}
    return { status: res.status, json };
  };
  const step = async (name, fn) => { try { await fn(); console.log('  ok  ', name); } catch (e) { console.log('  FALHA', name, '\n       ', e.message); process.exitCode = 1; } };

  const reg = (i, extra) => ({
    username: 'lutador' + i, firstName: 'Nome' + String.fromCharCode(97 + i), password: '1', arts: ['boxe', 'muaythai'], bestPick: 'muaythai',
    food: ['Salgadinho'], photo, nickname: '',
    device: { deviceId: 'dev' + i, ua: IPHONE_UA, screen: [390, 844], dpr: 3, lang: 'pt-BR' }, ...extra,
  });

  console.log('\nCadastro');
  let first;
  await step('cadastra com senha fraca "1" e recebe código de 6 dígitos', async () => {
    const r = await call('POST', '/api/register', reg(0));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert(/^\d{6}$/.test(r.json.me.code));
    first = r.json;
  });
  await step('barra usuário duplicado (sem diferenciar maiúscula)', async () => assert.strictEqual((await call('POST', '/api/register', reg(1, { username: 'LUTADOR0' }))).status, 409));
  await step('barra zoeira no usuário', async () => assert.strictEqual((await call('POST', '/api/register', reg(1, { username: 'pinto' }))).status, 400));
  await step('barra zoeira no "Outros"', async () => assert.strictEqual((await call('POST', '/api/register', reg(1, { food: ['Outros'], foodOther: 'rola grande' }))).status, 400));
  await step('exige texto em "Outros"', async () => assert.strictEqual((await call('POST', '/api/register', reg(1, { food: ['Outros'], foodOther: '' }))).status, 400));
  await step('exige 2 artes marciais', async () => assert.strictEqual((await call('POST', '/api/register', reg(1, { arts: ['boxe'] }))).status, 400));
  await step('exige foto', async () => assert.strictEqual((await call('POST', '/api/register', reg(1, { photo: '' }))).status, 400));
  await step('sobrenome é opcional', async () => assert.strictEqual((await call('POST', '/api/register', reg(1, { lastName: '' }))).status, 200));
  await step('apelido repetido é barrado', async () => {
    assert.strictEqual((await call('POST', '/api/register', reg(2, { nickname: 'Bones' }))).status, 200);
    assert.strictEqual((await call('POST', '/api/register', reg(3, { nickname: 'Bones' }))).status, 409);
  });
  await step('apelido fora da lista é barrado', async () => assert.strictEqual((await call('POST', '/api/register', reg(3, { nickname: 'Inventado' }))).status, 400));
  await step('login do amigo', async () => assert.strictEqual((await call('POST', '/api/login', { username: 'lutador0', password: '1' })).status, 200));
  await step('login com senha errada falha', async () => assert.strictEqual((await call('POST', '/api/login', { username: 'lutador0', password: 'x' })).status, 401));

  console.log('\nPublico x admin');
  await step('público nunca expõe senha, código ou aparelho', async () => {
    const r = await call('GET', '/api/public');
    const txt = JSON.stringify(r.json);
    assert(!txt.includes('"password"') && !txt.includes('"code"') && !txt.includes('deviceInfo'));
    assert.strictEqual(r.json.people.length, 0, 'pendentes não aparecem');
  });
  await step('rotas admin exigem login', async () => assert.strictEqual((await call('GET', '/api/admin/state')).status, 401));
  await step('senha de admin errada', async () => assert.strictEqual((await call('POST', '/api/admin/login', { password: 'x' })).status, 401));
  let adm;
  await step('login admin', async () => { const r = await call('POST', '/api/admin/login', { password: 'senha-de-teste' }); assert.strictEqual(r.status, 200); adm = r.json.token; });
  await step('admin vê o aparelho de cada cadastro', async () => {
    const r = await call('GET', '/api/admin/state', null, adm);
    const me = r.json.regs.find((x) => x.username === 'lutador0');
    assert(me.deviceInfo.label.includes('12 / 12 Pro / 13 / 13 Pro / 14'), me.deviceInfo.label);
    assert(me.code && me.password === '1');
  });
  await step('foto é servida', async () => {
    const res = await fetch(`${base}/api/photo/${first.me.id}`);
    assert.strictEqual(res.headers.get('content-type'), 'image/jpeg');
  });

  console.log('\nAprovação e torneio completo');
  const ids = [];
  for (let i = 10; i < 17; i++) { const r = await call('POST', '/api/register', reg(i, { arts: ['jiujitsu', 'boxe', 'capoeira'], bestPick: 'capoeira' })); ids.push(r.json.me.id); }
  await step('aprovar lutador exige notas, força, peso e altura', async () => {
    assert.strictEqual((await call('POST', `/api/admin/reg/${ids[0]}/approve`, { role: 'fighter', scores: { jiujitsu: 5 } }, adm)).status, 400);
  });
  await step('aprova 7 lutadores', async () => {
    for (let k = 0; k < ids.length; k++) {
      const r = await call('POST', `/api/admin/reg/${ids[k]}/approve`, { role: 'fighter', scores: { jiujitsu: 3 + k, boxe: 2 + k, capoeira: 4 }, strength: 3 + k, weight: 55 + k * 4, height: 160 + k * 3 }, adm);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    }
    const pub = await call('GET', '/api/public');
    assert.strictEqual(pub.json.people.length, 7);
    assert.strictEqual(pub.json.people[0].bestArt, 'capoeira', 'capoeira 4 > jiujitsu 3');
    assert.strictEqual(pub.json.people[6].bestArt, 'jiujitsu', 'jiujitsu 9 > capoeira 4');
  });
  await step('plano para 7 lutadores', async () => {
    const pub = await call('GET', '/api/public');
    assert.strictEqual(pub.json.plan.n, 7);
    assert(pub.json.plan.totalFights > 0);
  });
  await step('simula torneio inteiro pela API', async () => {
    assert.strictEqual((await call('POST', '/api/admin/tournament/start', null, adm)).status, 200);
    let guard = 0;
    for (;;) {
      assert(guard++ < 20, 'loop');
      let t = (await call('GET', '/api/public')).json.tournament;
      if (t.phase === 'finished') break;
      const round = t.rounds.find((r) => r.id === t.currentId);
      if (round.type === 'swiss' && round.pending.length) {
        const c = await call('GET', '/api/admin/candidates?fighter=' + round.pending[0], null, adm);
        assert(c.json.candidates.length >= 1);
        assert.strictEqual((await call('POST', '/api/admin/round/pair', { a: round.pending[0], b: c.json.candidates[0].id }, adm)).status, 200);
        assert.strictEqual((await call('POST', '/api/admin/round/auto', null, adm)).status, 200);
        t = (await call('GET', '/api/public')).json.tournament;
      }
      const cur = t.rounds.find((r) => r.id === t.currentId);
      for (const f of cur.fights) assert.strictEqual((await call('POST', `/api/admin/fight/${f.id}/result`, { winner: f.a, method: 'KO' }, adm)).status, 200);
      assert.strictEqual((await call('POST', '/api/admin/round/next', null, adm)).status, 200);
    }
    const t = (await call('GET', '/api/public')).json.tournament;
    assert(t.champion);
    console.log(`         campeão definido após ${t.rounds.reduce((a, r) => a + r.fights.length, 0)} lutas`);
  });
  await step('não dá para remover lutador que já está no torneio', async () => assert.strictEqual((await call('DELETE', `/api/admin/reg/${ids[0]}`, null, adm)).status, 400));
  await step('reiniciar torneio', async () => {
    assert.strictEqual((await call('POST', '/api/admin/tournament/reset', null, adm)).status, 200);
    assert.strictEqual((await call('GET', '/api/public')).json.tournament, null);
  });
  await step('boneco: só o admin define (não o amigo, nem apelido ou sobrenome)', async () => {
    const pend = await call('POST', '/api/register', reg(30, { firstName: 'Zeca', nickname: 'The Spider', lastName: 'Boxeador', bestPick: 'boxe', arts: ['boxe', 'jiujitsu'] }));
    assert.strictEqual(pend.status, 200);
    assert.strictEqual(pend.json.me.bestArt, null, 'pendente não tem boneco');
    const id = pend.json.me.id;
    const body = { role: 'fighter', scores: { boxe: 3, jiujitsu: 8 }, strength: 5, weight: 60, height: 170 };
    assert.strictEqual((await call('POST', `/api/admin/reg/${id}/approve`, body, adm)).status, 200);
    const art = async () => (await call('GET', '/api/public')).json.people.find((x) => x.id === id).bestArt;
    assert.strictEqual(await art(), 'jiujitsu', 'sem escolha do admin vale a maior nota');
    await call('POST', `/api/admin/reg/${id}/approve`, { ...body, doll: 'boxe' }, adm);
    assert.strictEqual(await art(), 'boxe', 'escolha do admin manda');
    await call('POST', `/api/admin/reg/${id}/approve`, { ...body, doll: 'capoeira' }, adm);
    assert.strictEqual(await art(), 'jiujitsu', 'arte que ele não marcou é ignorada');
  });
  await step('login do admin trava depois de 8 erros seguidos', async () => {
    let last;
    for (let i = 0; i < 9; i++) last = await call('POST', '/api/admin/login', { password: 'errada' + i });
    assert.strictEqual(last.status, 429);
  });
  await step('persistência em disco', async () => {
    const saved = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'db.json'), 'utf8'));
    assert(saved.state && Object.keys(saved.state.regs).length >= 10);
  });

  srv.close();
  console.log(process.exitCode ? '\nHouve falhas.\n' : '\nTudo certo.\n');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error(e); process.exit(1); });
