/* Chaveamento: plano, classificacao, rodadas, playoffs e controles do admin. */
(function () {
  var h = UI.h;
  var METHODS = ['KO', 'Finalização', 'Decisão', 'WO'];
  var PHASE = { swiss: 'Classificação', playoffs: 'Playoffs', finished: 'Encerrado' };
  var root = null;
  var sig = '';
  var busy = false;
  var methodSel = {};

  var P = function (id) { return App.person(id) || { id: id, firstName: '?', lastName: '', nickname: '', arts: [] }; };
  var num = function (n) { return String(n).replace('.', ','); };
  var byOrder = function (a, b) { return a.order - b.order; };
  function clock(base, add) {
    var p = String(base || '14:30').split(':');
    var m = (((+p[0] * 60 + +p[1] + Math.round(add)) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function slotMin() { var c = App.cfg(); return (Number(c.fightMin) || 7.5) + (Number(c.restMin) || 0); }
  function names(ids) { return ids.map(function (id) { return UI.full(P(id)); }).join(', '); }

  /* ---------- acoes do admin ---------- */
  function act(method, url, body) {
    if (busy) return;
    busy = true;
    UI.api(method, url, body, 'admin')
      .then(function () { return App.refresh(true); })
      .catch(function (e) { UI.toast(e.message, true); })
      .then(function () { busy = false; });
  }
  function result(id, winner, method) { act('POST', '/api/admin/fight/' + id + '/result', { winner: winner, method: method || null }); }

  function controls(f, round) {
    var sel = h('select', { 'aria-label': 'Método da vitória' },
      h('option', { value: '' }, 'Método'), METHODS.map(function (m) { return h('option', { value: m }, m); }));
    sel.value = methodSel[f.id] != null ? methodSel[f.id] : (f.method || '');
    sel.addEventListener('change', function () { methodSel[f.id] = sel.value; if (f.winner) result(f.id, f.winner, sel.value); });
    var win = function (id) {
      return h('button', { type: 'button', class: 'btn sm' + (f.winner === id ? '' : ' ghost'), onclick: function () { result(f.id, id, sel.value); } }, P(id).firstName + ' venceu');
    };
    return h('div', { class: 'fight-ctl' }, win(f.a), win(f.b), sel,
      f.winner ? h('button', { type: 'button', class: 'btn sm ghost', onclick: function () { delete methodSel[f.id]; result(f.id, null); } }, 'Limpar resultado') : null,
      !f.winner && round.type === 'swiss' ? h('button', { type: 'button', class: 'btn sm ghost undo', onclick: function () { act('DELETE', '/api/admin/fight/' + f.id); } }, 'Desfazer sorteio') : null);
  }

  /* ---------- pecas ---------- */
  function side(id, f, right) {
    var p = P(id);
    var cls = 'side-f' + (right ? ' r' : '') + (f.winner ? (f.winner === id ? ' win' : ' lose') : '');
    return h('div', { class: cls },
      h('img', { src: UI.photo(p), alt: '', loading: 'lazy' }),
      h('div', { class: 'nm-f' }, h('b', null, p.firstName), h('small', null, p.nickname ? '"' + p.nickname + '"' : (p.lastName || ' '))));
  }

  function fightRow(f, round, ctx) {
    var i = ctx.idx[f.id];
    var tag = f.winner ? h('small', { class: 'm' }, f.method || 'Vitória') : f.extra ? h('small', { class: 'x' }, 'Luta extra') : h('small', null, 'previsto');
    return h('div', { class: 'fight' + (f.winner ? ' done' : '') },
      h('div', { class: 'no' }, i + 1),
      side(f.a, f, false),
      h('div', { class: 'vs' }, 'VS'),
      side(f.b, f, true),
      h('div', { class: 'when-t' }, h('div', null, h('b', null, clock(App.cfg().startTime, i * ctx.slot)), tag)),
      ctx.ctl(round) ? controls(f, round) : null);
  }

  function matchBox(f, label, round, ph, ctx) {
    var box = h('div', { class: 'bk-m' + (round && round.type === 'final' || label === 'Final' ? ' final' : '') },
      h('div', { class: 'bk-h' }, h('span', null, label),
        h('span', null, f ? 'Luta ' + (ctx.idx[f.id] + 1) + ' · ' + clock(App.cfg().startTime, ctx.idx[f.id] * ctx.slot) : 'a definir')));
    if (!f) {
      ph.forEach(function (t) { box.append(h('div', { class: 'bk-ph' }, t)); });
      return box;
    }
    box.append(side(f.a, f), side(f.b, f));
    if (f.winner) box.append(h('div', { class: 'bk-r' }, P(f.winner).firstName + ' venceu' + (f.method ? ' por ' + f.method : '')));
    if (ctx.ctl(round)) box.append(controls(f, round));
    return box;
  }

  function bracket(t, ctx) {
    var semi = t.rounds.filter(function (r) { return r.type === 'semi'; })[0];
    var fin = t.rounds.filter(function (r) { return r.type === 'final'; })[0];
    var cols = [];
    if (t.playoff === 'top4') {
      var sf = semi ? semi.fights.slice().sort(byOrder) : [null, null];
      var ph = [['1º colocado', '4º colocado'], ['2º colocado', '3º colocado']];
      cols.push(h('div', { class: 'col' }, sf.map(function (f, i) { return matchBox(f, 'Semifinal ' + (i + 1), semi, ph[i], ctx); })));
      cols.push(h('div', { class: 'bk-link', 'aria-hidden': 'true' }));
    }
    var fph = t.playoff === 'top4' ? ['Vencedor semifinal 1', 'Vencedor semifinal 2'] : ['1º colocado', '2º colocado'];
    cols.push(h('div', { class: 'col fin' }, matchBox(fin && fin.fights[0], 'Final', fin, fph, ctx)));
    return h('div', { class: 'bracket' + (t.playoff === 'top4' ? '' : ' solo') }, cols);
  }

  function roundBlock(t, r, ctx, isCur) {
    var fights = r.fights.slice().sort(byOrder);
    var done = fights.filter(function (f) { return f.winner; }).length;
    var extraF = fights.filter(function (f) { return f.extra; })[0];
    return [
      h('div', { class: 'sec' }, r.name, h('small', null, isCur ? 'rodada atual · ' + done + '/' + fights.length : done + '/' + fights.length + ' lutas')),
      fights.length ? h('div', { class: 'fights' }, fights.map(function (f) { return fightRow(f, r, ctx); }))
        : h('div', { class: 'empty' }, 'Nenhuma luta sorteada ainda.'),
      r.byes.length ? h('div', { class: 'rest' }, 'Descansa nesta rodada: ', h('b', null, names(r.byes))) : null,
      r.extra ? h('div', { class: 'rest' }, 'Luta extra: ',
        extraF ? [h('b', null, UI.full(P(extraF.a))), ' enfrenta ', h('b', null, UI.full(P(extraF.b))), ', que luta duas vezes nesta rodada. Assim ninguém fica sem lutar.']
          : [h('b', null, UI.full(P(r.extra))), ' fica para a luta extra, sorteada depois que todos tiverem adversário.']) : null,
      isCur && r.pending && r.pending.length ? h('div', { class: 'rest wait' }, 'Aguardando sorteio: ', h('b', null, names(r.pending))) : null,
    ];
  }

  function table(t) {
    var played = t.standings.some(function (s) { return s.played; });
    var top = !played ? 0 : t.playoff === 'top4' ? 4 : t.playoff === 'final' ? 2 : 0;
    return [
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'rank' },
        h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Lutador'),
          h('th', { class: 'num', title: 'Jogos' }, 'J'), h('th', { class: 'num', title: 'Vitórias' }, 'V'), h('th', { class: 'num', title: 'Derrotas' }, 'D'), h('th', { class: 'num' }, 'Pts'))),
        h('tbody', null, t.standings.map(function (s, i) {
          var p = P(s.id);
          return h('tr', { class: i < top ? 'top' : '' },
            h('td', { class: 'pos' }, i + 1),
            h('td', null, h('div', { class: 'who' }, h('img', { class: 'face-s', src: UI.photo(p), alt: '', loading: 'lazy' }),
              h('div', { class: 'who-n' }, h('b', null, UI.full(p)), p.nickname ? h('small', null, '"' + p.nickname + '"') : null))),
            h('td', { class: 'num' }, s.played), h('td', { class: 'num' }, s.wins), h('td', { class: 'num' }, s.losses),
            h('td', { class: 'num pts' }, s.points));
        })))),
      h('p', { class: 'hint' }, 'Vitória vale 3 pontos. Se empatar em pontos, fica na frente quem ganhou de adversário mais forte.' +
        (top ? ' Os ' + top + ' primeiros (número em vermelho) vão pro mata-mata.' : '')),
    ];
  }

  function advLabel(t, cur) {
    var sw = t.rounds.filter(function (r) { return r.type === 'swiss'; }).length;
    if (cur.type === 'swiss') {
      if (sw < t.K) return 'Avançar para a Rodada ' + (sw + 1);
      return t.playoff === 'top4' ? 'Avançar para as semifinais' : t.playoff === 'final' ? 'Avançar para a final' : 'Encerrar e declarar o campeão';
    }
    return cur.type === 'semi' ? 'Avançar para a final' : 'Encerrar e declarar o campeão';
  }

  function adminBar(t, cur) {
    var items = [];
    if (cur.type === 'swiss' && cur.pending.length) {
      items.push(h('a', { class: 'btn big', href: '#/roleta' }, 'Sortear lutas na roleta'),
        h('span', { class: 'mute' }, 'Faltam ' + cur.pending.length + ' pra sortear nesta rodada.'));
    }
    if (t.canAdvance) {
      var label = advLabel(t, cur);
      var tmo;
      var b = h('button', { type: 'button', class: 'btn big' }, label);
      b.addEventListener('click', function () {
        if (!b.classList.contains('armed')) {
          b.classList.add('armed');
          b.textContent = 'Toca de novo pra confirmar';
          tmo = setTimeout(function () { b.classList.remove('armed'); b.textContent = label; }, 4000);
          return;
        }
        clearTimeout(tmo);
        act('POST', '/api/admin/round/next');
      });
      items.push(b);
    } else if (!(cur.type === 'swiss' && cur.pending.length)) {
      items.push(h('span', { class: 'mute' }, 'Registra o resultado de todas as lutas da rodada pra poder avançar.'));
    }
    return h('div', { class: 'adm-bar' }, UI.tag('Só você vê isso', 'ink'), h('div', { class: 'row' }, items));
  }

  /* ---------- telas ---------- */
  function before(plan, adm) {
    var c = App.cfg();
    var fighters = ((App.data && App.data.people) || []).filter(function (p) { return p.role === 'fighter'; });
    var n = plan.n || fighters.length;
    var est = plan.estMinutes || 0;
    var block = function (b, s) { return h('div', null, h('b', null, b), h('small', null, s)); };
    var po = {
      top4: 'Os 4 primeiros vão pra semifinal (1º x 4º e 2º x 3º). Quem ganhar faz a final.',
      final: 'Os 2 primeiros fazem a final.',
      none: 'Com pouca gente não tem mata-mata: quem somar mais pontos é o campeão.',
    }[plan.playoff || 'none'];
    var rounds = plan.rounds || 1;
    return [
      h('header', { class: 'ph' },
        h('h1', { class: 'page-title' }, 'Chaveamento'),
        h('p', { class: 'page-sub' }, 'Ainda não começou. Quando o Alisson der a largada, as lutas e os horários aparecem aqui.')),
      h('div', { class: 'figs' },
        block(n, n === 1 ? 'lutador aprovado' : 'lutadores aprovados'), block(n >= 2 ? rounds : '—', 'rodadas de classificação'),
        block(n >= 2 ? plan.totalFights : '—', 'lutas no total'), block(n >= 2 ? '~' + est : '—', 'minutos, mais ou menos'),
        block(n >= 2 ? clock(c.startTime, est) : '—', 'deve acabar')),
      (plan.warnings || []).map(function (w) { return h('div', { class: 'warn' }, h('b', null, 'Atenção'), w); }),
      adm ? h('div', { class: 'row adm-go' }, h('a', { class: 'btn', href: '#/admin' }, 'Abrir o painel do admin')) : null,
      h('div', { class: 'sec' }, 'Como vai ser'),
      h('ol', { class: 'regs how' },
        h('li', null, h('b', null, '3 rounds por luta.'), ' Cada luta dura ' + num(Number(c.fightMin) || 7.5) + ' minutos no total, com ' + num(Number(c.restMin) || 0) + ' min de intervalo entre uma e outra.'),
        h('li', null, h('b', null, 'Sorteio por nível.'), ' Cada um pega alguém de nível e peso parecidos, e ninguém repete adversário.'),
        h('li', null, h('b', null, 'Todo mundo luta.'), rounds > 1 ? ' São ' + rounds + ' rodadas de classificação e cada vitória vale 3 pontos.' : ' Uma rodada de classificação, e cada vitória vale 3 pontos.'),
        h('li', null, h('b', null, 'Depois, a decisão.'), ' ' + po)),
      h('div', { class: 'sec' }, 'Quem tá dentro', h('small', null, fighters.length)),
      fighters.length ? h('div', { class: 'plist' }, fighters.map(function (p) { return UI.person(p); }))
        : h('div', { class: 'empty' }, 'Ninguém aprovado como lutador ainda.'),
    ];
  }

  function started(t, adm) {
    var all = [];
    t.rounds.forEach(function (r) { all = all.concat(r.fights); });
    all.sort(byOrder);
    var idx = {};
    all.forEach(function (f, i) { idx[f.id] = i; });
    var n = t.fighters.length;
    var total = t.K * Math.floor(n / 2) + (n % 2 && t.K === 1 ? 1 : 0) + ({ top4: 3, final: 1 }[t.playoff] || 0);
    var done = all.filter(function (f) { return f.winner; }).length;
    var cur = t.rounds.filter(function (r) { return r.id === t.currentId; })[0];
    var nextF = all.filter(function (f) { return !f.winner; })[0];
    var slot = slotMin();
    var live = t.phase !== 'finished';
    var ctx = { idx: idx, slot: slot, ctl: function (r) { return adm && live && r && r.id === t.currentId; } };
    var swiss = t.rounds.filter(function (r) { return r.type === 'swiss'; });
    var curSwiss = cur && cur.type === 'swiss' && live ? cur : null;
    var old = swiss.filter(function (r) { return r !== curSwiss; }).reverse();
    var champ = t.phase === 'finished' && t.champion ? P(t.champion) : null;
    var playoffs = t.playoff === 'none' ? null : [
      h('div', { class: 'sec' }, 'Playoffs', h('small', null, t.phase === 'swiss' ? 'depois da classificação' : t.playoff === 'top4' ? 'semifinais e final' : 'final')),
      bracket(t, ctx)];

    return [
      h('header', { class: 'ph' },
        h('h1', { class: 'page-title' }, 'Chaveamento'),
        h('p', { class: 'page-sub' }, 'Os horários são chute: começa às ' + (App.cfg().startTime || '14:30') + ' e cada luta ocupa uns ' + num(slot) + ' min, contando o intervalo.')),
      h('div', { class: 'status-bar' },
        h('div', { class: 'on' }, h('b', null, PHASE[t.phase] || t.phase), h('small', null, 'fase')),
        cur ? h('div', null, h('b', null, cur.type === 'swiss' ? cur.name + ' de ' + t.K : cur.name), h('small', null, live ? 'rodada atual' : 'última rodada')) : null,
        h('div', null, h('b', null, done + '/' + total), h('small', null, 'lutas feitas')),
        nextF && live ? h('div', null, h('b', null, 'Luta ' + (idx[nextF.id] + 1) + ' · ' + clock(App.cfg().startTime, idx[nextF.id] * slot)), h('small', null, 'próxima')) : null),
      champ ? h('div', { class: 'champ' },
        h('div', { class: 'champ-doll' }, h('img', { src: UI.doll(champ.bestArt), alt: '' })),
        h('div', { class: 'champ-n' },
          h('img', { class: 'champ-face', src: UI.photo(champ), alt: UI.full(champ) }),
          h('div', null, UI.tag('Campeão', 'gold')),
          h('b', null, champ.firstName),
          champ.nickname ? h('i', null, '"' + champ.nickname + '"') : null,
          champ.lastName ? h('b', { class: 'ln' }, champ.lastName) : null,
          h('small', null, 'Campeão do Octógono Sexta'))) : null,
      adm && live && cur ? adminBar(t, cur) : null,
      t.phase !== 'swiss' ? playoffs : null,
      curSwiss ? roundBlock(t, curSwiss, ctx, true) : null,
      h('div', { class: 'sec' }, 'Classificação'),
      table(t),
      t.phase === 'swiss' ? playoffs : null,
      old.map(function (r) { return roundBlock(t, r, ctx, false); }),
    ];
  }

  function flat(list, out) {
    list.forEach(function (x) { if (Array.isArray(x)) flat(x, out); else if (x) out.push(x); });
    return out;
  }

  function draw(el) {
    var d = App.data || {};
    var t = d.tournament;
    var adm = App.isAdmin();
    var c = App.cfg();
    var s = JSON.stringify([t, t ? null : d.plan, (d.people || []).map(function (p) { return [p.id, p.firstName, p.lastName, p.nickname, p.bestArt, p.role, p.photoV]; }), c.startTime, c.fightMin, c.restMin, adm]);
    if (el === root && s === sig) return;
    root = el;
    sig = s;
    el.replaceChildren.apply(el, flat(t ? started(t, adm) : before(d.plan || {}, adm), []));
  }

  App.route('#/chaveamento', {
    title: 'Chaveamento',
    render: function (el) { root = null; draw(el); },
    onData: function (el) {
      var a = document.activeElement;
      if (a && a.tagName === 'SELECT' && el.contains(a)) {
        a.addEventListener('blur', function () { if (App.el === el) draw(el); }, { once: true });
        return;
      }
      draw(el);
    },
  });
})();
