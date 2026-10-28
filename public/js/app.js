/* Nucleo: rotas, menu, atualizacao automatica e as telas simples. */
(function () {
  var h = UI.h;
  var App = window.App = { data: null, me: null, routes: {}, cur: null, el: null };

  var NAV = [
    ['#/', 'Início'], ['#/cadastro', 'Cadastro'], ['#/lutadores', 'Lutadores'],
    ['#/chaveamento', 'Chaveamento'], ['#/roleta', 'Roleta'], ['#/comida', 'Comida'], ['#/admin', 'Admin'],
  ];
  var ALIAS = { '#/entrar': '#/cadastro', '#/perfil': '#/cadastro' };

  App.isAdmin = function () { return !!UI.ls.get('adm'); };
  App.loggedIn = function () { return !!UI.ls.get('tok'); };
  App.go = function (hash) { if (location.hash === hash) App.render(); else location.hash = hash; };
  App.person = function (id) { return ((App.data && App.data.people) || []).find(function (p) { return p.id === id; }); };
  App.cfg = function () { return (App.data && App.data.config) || {}; };

  /* ---------- campo com filtro de zoeira ao vivo ---------- */
  App.field = function (label, input, opts) {
    var o = opts || {};
    var err = h('div', { class: 'err', hidden: true });
    var wrap = h('div', { class: 'field' },
      h('label', null, label, o.optional ? h('em', null, 'opcional') : null), input, err,
      o.hint ? h('div', { class: 'hint' }, o.hint) : null);
    wrap.setErr = function (msg) { err.textContent = msg || ''; err.hidden = !msg; input.classList.toggle('bad', !!msg); };
    if (!o.noFilter) {
      input.addEventListener('input', function () {
        wrap.setErr(Filter.check(input.value) ? 'Sem zoeira. Escreve sério.' : '');
      });
    }
    return wrap;
  };

  /* ---------- o que vai levar ---------- */
  App.foodPicker = function (state, onChange) {
    var opts = (App.data && App.data.foodOptions) || ['Refrigerante', 'Salgadinho', 'Água', 'Gelo', 'Copos e pratos', 'Doce ou bolo', 'Outros'];
    var box = h('div');
    var other = h('input', { type: 'text', maxlength: '60', placeholder: 'Escreve o que você vai levar', value: state.foodOther || '' });
    var otherField = App.field('O que é "Outros"? (obrigatório)', other);
    other.addEventListener('input', function () { state.foodOther = other.value; if (onChange) onChange(); });
    function draw() {
      var chips = h('div', { class: 'chips' }, opts.map(function (o) {
        var on = state.food.indexOf(o) >= 0;
        return h('button', {
          type: 'button', class: 'toggle' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false',
          onclick: function () {
            var i = state.food.indexOf(o);
            if (i >= 0) state.food.splice(i, 1); else state.food.push(o);
            draw(); if (onChange) onChange();
          },
        }, o);
      }));
      otherField.hidden = state.food.indexOf('Outros') < 0;
      box.replaceChildren(chips, otherField);
    }
    draw();
    box.otherField = otherField;
    box.otherInput = other;
    return box;
  };

  App.foodError = function (state) {
    if (!state.food.length) return 'Marca pelo menos uma coisa pra levar.';
    if (state.food.indexOf('Outros') >= 0) {
      if ((state.foodOther || '').trim().length < 3) return 'Em "Outros", escreve o que você vai levar.';
      if (Filter.check(state.foodOther)) return 'Sem zoeira. Escreve sério.';
    }
    return '';
  };

  /* ---------- dados ---------- */
  App.refresh = function (force) {
    return fetch('/api/public?v=' + (force || !App.data ? 0 : App.data.v))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.unchanged) return;
        App.data = d;
        App.drawNav();
        var r = App.cur;
        if (r && r.onData) r.onData(App.el);
      })
      .catch(function () {});
  };

  App.loadMe = function () {
    if (!App.loggedIn()) { App.me = null; return Promise.resolve(null); }
    return UI.api('GET', '/api/me').then(function (d) { App.me = d.me; return d.me; })
      .catch(function (e) { if (e.status === 401) { UI.ls.del('tok'); App.me = null; } return null; });
  };

  /* ---------- menu ---------- */
  function setMenu(open) {
    document.body.classList.toggle('menu', open);
    var b = document.getElementById('menuBtn');
    b.textContent = open ? 'Fechar' : 'Menu';
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  App.drawNav = function () {
    var nav = document.getElementById('nav');
    var hash = ALIAS[location.hash] || location.hash || '#/';
    nav.replaceChildren.apply(nav, NAV.map(function (n) {
      var href = n[0];
      var label = n[1];
      if (href === '#/cadastro' && App.loggedIn()) { href = '#/perfil'; label = 'Meu perfil'; }
      var badge = null;
      if (n[0] === '#/admin' && App.isAdmin() && App.data && App.data.pending) badge = h('span', { class: 'n' }, App.data.pending);
      return h('a', { href: href, class: hash === n[0] ? 'on' : '' }, h('span', null, label), badge);
    }));
    var c = App.cfg();
    document.getElementById('sideFoot').replaceChildren(
      h('span', null, 'Sexta, ', h('b', null, c.startTime || '14:30')),
      h('span', null, c.place || 'Casa do Nathan'));
  };

  /* ---------- rotas ---------- */
  App.route = function (hash, def) { App.routes[hash] = def; };

  var settle;
  App.render = function () {
    if (App.cur && App.cur.leave) App.cur.leave();
    var hash = location.hash || '#/';
    var def = App.routes[hash] || App.routes['#/'];
    App.cur = def;
    setMenu(false);
    var view = document.getElementById('view');
    App.el = view;
    view.replaceChildren();
    App.drawNav();
    window.scrollTo(0, 0);
    document.title = (def.title ? def.title + ' · ' : '') + 'Octógono Sexta';
    var box = h('div', { class: 'rise' });
    view.append(box);
    App.el = box;
    def.render(box);
    // entrada escalonada so na primeira montagem; redesenhos por dados novos nao piscam
    clearTimeout(settle);
    settle = setTimeout(function () { box.classList.remove('rise'); }, 1400);
  };

  /* ---------- abertura ---------- */
  function intro() {
    var el = document.getElementById('intro');
    var seen = false;
    try { seen = sessionStorage.getItem('intro') === '1'; sessionStorage.setItem('intro', '1'); } catch (e) {}
    if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.remove(); return; }
    var t1 = document.getElementById('introT1');
    'OCTÓGONO'.split('').forEach(function (ch, i) {
      t1.append(h('span', { style: { animationDelay: (0.45 + i * 0.07) + 's' } }, ch));
    });
    var done = false;
    function out() { if (done) return; done = true; el.classList.add('out'); setTimeout(function () { el.remove(); }, 600); }
    el.addEventListener('click', out);
    setTimeout(out, 3100);
  }

  App.start = function () {
    intro();
    document.getElementById('menuBtn').addEventListener('click', function () { setMenu(!document.body.classList.contains('menu')); });
    document.getElementById('scrim').addEventListener('click', function () { setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('menu')) setMenu(false); });
    window.addEventListener('hashchange', App.render);
    Promise.all([App.refresh(true), App.loadMe()]).then(function () { App.render(); });
    setInterval(function () { if (!document.hidden) App.refresh(); }, 5000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) App.refresh(); });
  };

  /* ================= INICIO ================= */
  function nextStart() {
    var parts = (App.cfg().startTime || '14:30').split(':');
    var now = new Date();
    var d = new Date(now);
    d.setHours(+parts[0], +parts[1], 0, 0);
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
    if (d < now && now - d > 8 * 3600 * 1000) d.setDate(d.getDate() + 7);
    return d;
  }

  /* Quem aparece no cartaz da capa: a proxima luta, o campeao ou dois aprovados. */
  function heroPair(data) {
    var t = data.tournament;
    if (t) {
      if (t.phase === 'finished' && t.champion && App.person(t.champion)) return { champ: App.person(t.champion) };
      var all = [];
      t.rounds.forEach(function (r) { all = all.concat(r.fights); });
      all.sort(function (a, b) { return a.order - b.order; });
      var nf = all.filter(function (f) { return !f.winner; })[0];
      if (nf && App.person(nf.a) && App.person(nf.b)) return { a: App.person(nf.a), b: App.person(nf.b), cap: 'Próxima luta' };
    }
    var f = data.people.filter(function (p) { return p.role === 'fighter' && p.bestArt; });
    if (f.length >= 2) return { a: f[0], b: f[1], cap: 'Já confirmados' };
    return { a: null, b: null };
  }

  function heroDoll(p, side, art) {
    return h('figure', { class: 'hd ' + side },
      h('img', { src: UI.doll(p ? p.bestArt : art), alt: '' }),
      p ? h('figcaption', null, p.nickname ? '"' + p.nickname + '"' : p.firstName) : null);
  }

  function ticker(data) {
    var f = data.people.filter(function (p) { return p.role === 'fighter'; });
    var words = f.length ? f.map(function (p) { return p.nickname || UI.full(p); })
      : ['Octógono Sexta', (App.cfg().startTime || '14:30'), (App.cfg().place || 'Casa do Nathan'), 'Todo mundo luta'];
    while (words.length < 6) words = words.concat(words);
    function run(hidden) {
      return h('div', { class: 'tk-run', 'aria-hidden': hidden ? 'true' : null }, words.map(function (w) { return h('span', null, w); }));
    }
    return h('div', { class: 'ticker', 'aria-label': 'Lutadores: ' + words.join(', ') }, h('div', { class: 'tk-in' }, run(false), run(true)));
  }

  App.route('#/', {
    title: '',
    render: function (el) {
      var data = App.data || { people: [], pending: 0, config: {} };
      var fighters = data.people.filter(function (p) { return p.role === 'fighter'; }).length;
      var aud = data.people.length - fighters;
      var c = App.cfg();
      var cd = h('div', { class: 'count', role: 'timer' });
      var timer;
      function tick() {
        var diff = nextStart() - new Date();
        if (diff <= 0) { cd.replaceChildren(h('span', { class: 'cd-now' }, 'É hoje. Tá rolando.')); return; }
        var s = Math.floor(diff / 1000);
        var parts = [['dias', Math.floor(s / 86400)], ['h', Math.floor(s % 86400 / 3600)], ['min', Math.floor(s % 3600 / 60)], ['s', s % 60]];
        if (!parts[0][1]) parts.shift();
        cd.replaceChildren.apply(cd, parts.map(function (p) { return h('span', { class: 'cd' }, h('b', null, String(p[1]).padStart(2, '0')), h('small', null, p[0])); }));
      }
      tick();
      timer = setInterval(tick, 1000);
      App.cur.leave = function () { clearInterval(timer); };

      var pair = heroPair(data);
      var art = pair.champ
        ? h('div', { class: 'hero-art is-champ' }, heroDoll(pair.champ, 'a'), h('p', { class: 'hero-cap' }, UI.tag('Campeão', 'gold'), ' ', UI.full(pair.champ)))
        : h('div', { class: 'hero-art' }, heroDoll(pair.a, 'a', 'boxe'), heroDoll(pair.b, 'b', 'muaythai'),
          pair.a ? h('p', { class: 'hero-cap' }, UI.tag(pair.cap), ' ', pair.a.firstName, h('span', null, ' x '), pair.b.firstName) : null);

      el.append(
        h('section', { class: 'hero' },
          art,
          h('div', { class: 'hero-txt' },
            h('p', { class: 'hero-k' }, UI.tag('Sexta, ' + (c.startTime || '14:30')), ' ', c.place || 'Casa do Nathan'),
            h('h1', { class: 'hero-t' }, h('span', { class: 'l1' }, 'Octógono'), h('span', { class: 'l2' }, 'Sexta')),
            h('div', { class: 'hero-cd' }, h('span', { class: 'cd-lbl' }, 'Começa em'), cd),
            h('div', { class: 'hero-cta' },
              App.loggedIn()
                ? h('a', { class: 'btn big', href: '#/perfil' }, 'Meu perfil')
                : [h('a', { class: 'btn big', href: '#/cadastro' }, 'Quero participar'), h('a', { class: 'lnk', href: '#/entrar' }, 'Já me cadastrei')],
              h('a', { class: 'lnk', href: '#/chaveamento' }, 'Ver as lutas')))),
        ticker(data),
        h('section', { class: 'home-how' },
          h('div', { class: 'how-l' },
            h('h2', { class: 'big-h' }, 'Como', h('br'), 'rola'),
            h('p', { class: 'lead' }, 'Você se cadastra, ganha um código de 6 números e manda pro Alisson no WhatsApp. Ele confere se é você mesmo e aprova.'),
            h('p', null, 'No dia, a roleta sorteia as lutas. Todo mundo luta, e sempre contra alguém do seu tamanho e do seu nível.'),
            h('p', { class: 'tally' },
              h('b', null, fighters), ' vão lutar', h('span', null, '/'), h('b', null, aud), ' só assistindo',
              App.isAdmin() ? [h('span', null, '/'), h('a', { href: '#/admin' }, h('b', null, data.pending), ' esperando você')] : null)),
          h('div', { class: 'how-r' },
            h('h3', { class: 'regs-h' }, 'Regras do cadastro'),
            h('ol', { class: 'regs' },
              h('li', null, h('b', null, 'Foto do seu rosto.'), ' De frente, dá pra ver quem é. Cachorro, meme, desenho ou foto de outra pessoa: recusado.'),
              h('li', null, h('b', null, 'Nome de verdade.'), ' Só o primeiro nome é obrigatório. Sobrenome e apelido são opcionais.'),
              h('li', null, h('b', null, 'Responde sério.'), ' Zoeira, palavrão e nome falso são barrados na hora.'),
              h('li', null, h('b', null, 'Pelo menos 2 artes marciais.'), ' As que você treina ou sabe lutar.'),
              h('li', null, h('b', null, 'Todo mundo leva alguma coisa.'), ' Lutador ou plateia. A pizza a gente racha.')))));
    },
    onData: function (el) { if (App.cur.leave) App.cur.leave(); el.replaceChildren(); App.cur.render(el); },
  });

  /* ================= ENTRAR ================= */
  App.route('#/entrar', {
    title: 'Entrar',
    render: function (el) {
      if (App.loggedIn() && App.me) return App.go('#/perfil');
      var u = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none' });
      var p = h('input', { type: 'password', autocomplete: 'current-password' });
      var err = h('div', { class: 'err', hidden: true });
      function go() {
        UI.api('POST', '/api/login', { username: u.value, password: p.value }).then(function (d) {
          UI.ls.set('tok', d.token); UI.ls.set('pw', p.value); App.me = d.me; App.go('#/perfil');
        }).catch(function (e) { err.textContent = e.message; err.hidden = false; });
      }
      p.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      el.append(
        h('div', { class: 'split' },
          h('div', null,
            h('h1', { class: 'page-title' }, 'Entrar'),
            h('p', { class: 'page-sub' }, 'Usa o usuário e a senha que você criou no cadastro.')),
          h('div', { class: 'form-slab' },
            h('div', { class: 'field' }, h('label', null, 'Usuário'), u),
            h('div', { class: 'field' }, h('label', null, 'Senha'), p),
            err,
            h('div', { class: 'row', style: { marginTop: '18px' } }, h('button', { class: 'btn', type: 'button', onclick: go }, 'Entrar'), h('a', { class: 'lnk', href: '#/cadastro' }, 'Ainda não tenho cadastro')))));
    },
  });

  /* ================= PERFIL ================= */
  var STATUS = {
    pending: ['Esperando o Alisson', 'Manda o código pro Alisson no WhatsApp. Quando ele aprovar, você aparece no site.'],
    rejected: ['Cadastro recusado', 'O Alisson recusou esse cadastro. Fala com ele pra resolver.'],
  };

  App.route('#/perfil', {
    title: 'Meu perfil',
    render: function (el) {
      if (!App.loggedIn()) return App.go('#/entrar');
      el.append(h('p', { class: 'mute' }, 'Carregando...'));
      App.loadMe().then(function (me) {
        if (!me) return App.go('#/entrar');
        draw(el, me);
      });
    },
  });

  function draw(el, me) {
    var st = me.status === 'approved'
      ? (me.role === 'fighter'
        ? ['Você vai lutar', 'Tá aprovado como lutador. Fica de olho no chaveamento pra ver contra quem e que horas.']
        : ['Você tá na plateia', 'Vai assistir, mas tem que levar comida. Confere aí embaixo se tá certo.'])
      : STATUS[me.status];
    var food = { food: me.food.slice(), foodOther: me.foodOther || '' };
    var msg = h('div', { class: 'err', hidden: true });
    var save = h('button', { class: 'btn sm', type: 'button', onclick: function () {
      var e = App.foodError(food);
      if (e) { msg.textContent = e; msg.hidden = false; return; }
      msg.hidden = true;
      UI.api('PUT', '/api/me/food', food).then(function (d) { App.me = d.me; UI.toast('Salvo'); App.refresh(true); }).catch(function (x) { msg.textContent = x.message; msg.hidden = false; });
    } }, 'Salvar');
    var wa = UI.waLink(App.cfg(), me, UI.ls.get('pw') || me.password);
    var kind = me.status === 'approved' ? 'ink' : me.status === 'rejected' ? 'ghost' : '';

    el.replaceChildren.apply(el, [
      h('p', { class: 'kicker' }, 'Meu perfil · @' + me.username),
      UI.ficha(me, me.arts),
      h('div', { class: 'state' },
        h('div', null, UI.tag(me.status === 'approved' ? 'Aprovado' : me.status === 'rejected' ? 'Recusado' : 'Pendente', kind),
          h('h2', null, st[0])),
        h('p', null, st[1])),
      me.status === 'pending' ? h('div', { class: 'code-slab' },
        h('div', null, h('div', { class: 'lbl' }, 'Seu código'), h('div', { class: 'code' }, me.code)),
        h('div', null,
          h('a', { class: 'btn wa block', href: wa.url, target: '_blank', rel: 'noopener' }, 'Mandar pro Alisson no WhatsApp'),
          wa.hasNumber ? null : h('div', { class: 'hint' }, 'O número dele ainda não tá no site. O WhatsApp vai abrir pra você escolher o contato.'))) : null,
      h('div', { class: 'sec' }, 'O que você leva'),
      App.foodPicker(food),
      msg,
      h('div', { class: 'row', style: { marginTop: '18px' } }, save),
      h('hr', { class: 'rule' }),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: function () { UI.ls.del('tok'); UI.ls.del('pw'); App.me = null; App.go('#/'); } }, 'Sair da conta'),
    ].filter(Boolean));
  }

  /* ================= LUTADORES ================= */
  App.route('#/lutadores', {
    title: 'Lutadores',
    render: function (el) {
      var people = (App.data && App.data.people) || [];
      var t = App.data && App.data.tournament;
      var rec = {};
      if (t) t.standings.forEach(function (s) { rec[s.id] = s.wins + 'V ' + s.losses + 'D'; });
      var fighters = people.filter(function (p) { return p.role === 'fighter'; });
      var aud = people.filter(function (p) { return p.role !== 'fighter'; });
      var mine = App.me && App.me.id;
      el.replaceChildren(
        h('header', { class: 'ph' },
          h('h1', { class: 'page-title' }, 'Lutadores'),
          h('p', { class: 'page-sub' }, 'Só aparece quem o Alisson já aprovou. O boneco é ele que escolhe, pela arte em que cada um é melhor.')),
        h('div', { class: 'sec' }, 'No octógono', h('small', null, fighters.length)),
        fighters.length ? h('div', { class: 'lineup' }, fighters.map(function (p, i) {
          return UI.tile(p, { me: p.id === mine, no: i + 1, rec: rec[p.id] });
        })) : h('div', { class: 'empty' }, 'Ninguém aprovado como lutador ainda.'),
        h('div', { class: 'sec' }, 'Na plateia', h('small', null, aud.length)),
        aud.length ? h('div', { class: 'plist' }, aud.map(function (p) { return UI.person(p, { me: p.id === mine }); }))
          : h('div', { class: 'empty' }, 'Ninguém na plateia ainda.'));
    },
    onData: function (el) { App.cur.render(el); },
  });

  /* ================= COMIDA ================= */
  App.route('#/comida', {
    title: 'Comida',
    render: function (el) {
      var c = App.cfg();
      var people = (App.data && App.data.people) || [];
      var n = Math.max(1, c.people || people.length || 1);
      var per = (c.pizzaTotal || 0) / n;
      var opts = (App.data && App.data.foodOptions) || [];
      el.replaceChildren(
        h('header', { class: 'ph' },
          h('h1', { class: 'page-title' }, 'Comida'),
          h('p', { class: 'page-sub' }, 'O que é caro a gente racha. O resto, cada um leva o que marcou no cadastro.')),
        h('div', { class: 'eq' },
          h('div', null, h('b', null, 'R$ ' + (c.pizzaTotal || 0).toFixed(0)), h('small', null, '2 pizzas')),
          h('span', { class: 'op' }, '÷'),
          h('div', null, h('b', null, n), h('small', null, n === 1 ? 'pessoa' : 'pessoas')),
          h('span', { class: 'op' }, '='),
          h('div', { class: 'res' }, h('b', null, 'R$ ' + per.toFixed(2).replace('.', ',')), h('small', null, 'cada um'))),
        h('div', { class: 'sec' }, 'Quem leva o quê'),
        h('div', { class: 'food' }, opts.map(function (o) {
          var who = people.filter(function (p) { return p.food.indexOf(o) >= 0; });
          return h('div', { class: 'food-row' + (who.length ? '' : ' none') },
            h('h3', null, o),
            h('span', { class: 'food-n' }, who.length),
            h('div', { class: 'food-who' }, who.length ? who.map(function (p) {
              return h('span', { class: 'who' }, h('img', { class: 'face-s', src: UI.photo(p), alt: '' }),
                h('span', null, UI.full(p), o === 'Outros' && p.foodOther ? h('small', null, ' (' + p.foodOther + ')') : null));
            }) : h('span', { class: 'mute' }, 'Ninguém ainda.')));
        })));
    },
    onData: function (el) { App.cur.render(el); },
  });
})();
