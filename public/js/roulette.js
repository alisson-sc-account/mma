/* Roleta: sorteio ao vivo dos confrontos da rodada de classificacao. */
(function () {
  var h = UI.h;
  var TAU = Math.PI * 2;
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var DUR = REDUCE ? 1200 : 5000;
  var S = null; // estado da tela enquanto ela esta aberta

  var mod = function (x, m) { return ((x % m) + m) % m; };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  function tour() { return App.data && App.data.tournament; }
  function curRound(t) { return t ? t.rounds.filter(function (r) { return r.id === t.currentId; })[0] || null : null; }
  function P(id) { return App.person(id) || { id: id, firstName: '?', lastName: '', arts: [], bestArt: 'boxe' }; }

  /* Inteiro uniforme em [0, n), sorteado pelo gerador criptografico do navegador. */
  function rand(n) {
    var lim = Math.floor(0x100000000 / n) * n;
    var buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= lim);
    return buf[0] % n;
  }

  /* ---------- som (sem arquivos: WebAudio) ---------- */
  var audio = null;
  var lastTic = 0;
  function muted() { return UI.ls.get('rl-mute') === '1'; }
  function unlockAudio() {
    if (muted()) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function beep(freq, len, vol, type) {
    if (muted() || !audio) return;
    try {
      var t = audio.currentTime;
      var o = audio.createOscillator();
      var g = audio.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t);
      o.stop(t + len + 0.02);
    } catch (e) {}
  }
  function tic() {
    var now = performance.now();
    if (now - lastTic < 38) return;
    lastTic = now;
    beep(1500, 0.03, 0.05);
  }
  function thud() { beep(140, 0.35, 0.18, 'triangle'); }

  /* ---------- roleta em canvas ---------- */
  var COLORS = ['#5e0d10', '#1b0606'];
  var ODD_LAST = '#3a090b';

  function Wheel(wrap, rot) {
    var cv = h('canvas', { role: 'img', 'aria-label': 'Roleta' });
    wrap.replaceChildren(h('div', { class: 'pointer' }), cv);
    var w = { items: [], rot: rot || 0, hi: -1, hub: '', spinning: false, raf: 0 };

    w.size = function () {
      var css = Math.round(wrap.clientWidth || 300);
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var px = Math.max(200, Math.round(css * dpr));
      if (cv.width !== px) { cv.width = px; cv.height = px; }
      w.draw();
    };
    w.set = function (items, hub) { w.items = items; w.hi = -1; w.hub = hub || ''; w.draw(); };

    w.draw = function () {
      var ctx = cv.getContext('2d');
      var W = cv.width;
      var C = W / 2;
      var r = C - W * 0.012;
      var n = w.items.length;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, W);
      ctx.translate(C, C);
      if (!n) {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = '#1b0606'; ctx.fill();
        ctx.lineWidth = W * 0.006; ctx.strokeStyle = '#f1e9e4'; ctx.stroke();
        hubDraw(ctx, W, r);
        return;
      }
      var seg = TAU / n;
      for (var i = 0; i < n; i++) {
        var a0 = w.rot + i * seg - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, a0, a0 + seg);
        ctx.closePath();
        ctx.fillStyle = i === w.hi ? '#a8191d' : (n % 2 && i === n - 1 && n > 1 ? ODD_LAST : COLORS[i % 2]);
        ctx.fill();
      }
      if (n > 1) {
        ctx.strokeStyle = 'rgba(241,233,228,.22)';
        ctx.lineWidth = Math.max(1, W * 0.0025);
        for (var j = 0; j < n; j++) {
          var a = w.rot + j * seg - Math.PI / 2;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
        }
      }
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
      ctx.lineWidth = W * 0.006; ctx.strokeStyle = '#f1e9e4'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.955, 0, TAU);
      ctx.lineWidth = Math.max(1, W * 0.002); ctx.strokeStyle = 'rgba(241,233,228,.25)'; ctx.stroke();

      // nomes
      var outer = r * 0.9;
      var inner = r * 0.27;
      var maxLen = outer - inner;
      for (var k = 0; k < n; k++) {
        var it = w.items[k];
        var mid = w.rot + (k + 0.5) * seg - Math.PI / 2;
        var chord = n === 1 ? r : 2 * (r * 0.62) * Math.sin(Math.min(seg, Math.PI) / 2);
        var fs = Math.min(W * 0.075, chord * 0.6);
        // na metade esquerda o texto e virado para nao ficar de cabeca para baixo
        var flip = Math.cos(mid) < -0.01;
        ctx.save();
        ctx.rotate(flip ? mid + Math.PI : mid);
        ctx.textAlign = flip ? 'left' : 'right';
        var x = flip ? -outer : outer;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = k === w.hi ? '#ffffff' : '#f1e9e4';
        ctx.font = '400 ' + fs + 'px Anton, Impact, sans-serif';
        var tw = ctx.measureText(it.label).width;
        if (tw > maxLen) { fs *= maxLen / tw; ctx.font = '400 ' + fs + 'px Anton, Impact, sans-serif'; }
        var sub = it.sub && chord > fs * 2.3 ? it.sub : '';
        if (sub) {
          ctx.fillText(it.label, x, -fs * 0.3);
          var ss = fs * 0.36;
          ctx.font = 'italic 800 ' + ss + 'px Archivo, "Arial Narrow", sans-serif';
          var sw = ctx.measureText(sub).width;
          if (sw > maxLen) { ss *= maxLen / sw; ctx.font = 'italic 800 ' + ss + 'px Archivo, "Arial Narrow", sans-serif'; }
          ctx.fillStyle = k === w.hi ? '#ffffff' : 'rgba(241,233,228,.62)';
          ctx.fillText(sub, x, fs * 0.42);
        } else {
          ctx.fillText(it.label, x, fs * 0.04);
        }
        ctx.restore();
      }
      hubDraw(ctx, W, r);
    };

    function hubDraw(ctx, W, r) {
      var R = r * 0.22;
      ctx.beginPath();
      for (var i = 0; i < 8; i++) {
        var a = Math.PI / 8 + i * TAU / 8;
        var x = Math.cos(a) * R;
        var y = Math.sin(a) * R;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#120505';
      ctx.fill();
      ctx.lineWidth = W * 0.008;
      ctx.strokeStyle = '#a8191d';
      ctx.stroke();
      if (w.hub) {
        ctx.fillStyle = '#f1e9e4';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '400 ' + (R * 0.62) + 'px Anton, Impact, sans-serif';
        ctx.fillText(w.hub, 0, R * 0.05);
      }
    }

    function sliceAt(rot) { return Math.floor(mod(-rot, TAU) / (TAU / w.items.length)); }

    /* Gira ate o centro da fatia `index` ficar exatamente embaixo do ponteiro. */
    w.spin = function (index, done) {
      var n = w.items.length;
      var seg = TAU / n;
      var target = mod(-(index + 0.5) * seg, TAU);
      var delta = target - mod(w.rot, TAU);
      if (delta < 0) delta += TAU;
      var turns = REDUCE ? 1 : 5 + rand(3);
      var from = w.rot;
      var to = from + turns * TAU + delta;
      var t0 = performance.now();
      var last = sliceAt(from);
      w.hi = -1;
      w.spinning = true;
      function frame(now) {
        var t = Math.min(1, (now - t0) / DUR);
        w.rot = from + (to - from) * ease(t);
        var s = sliceAt(w.rot);
        if (s !== last) { last = s; tic(); }
        if (t < 1) { w.draw(); w.raf = requestAnimationFrame(frame); return; }
        w.rot = mod(to, TAU);
        w.spinning = false;
        w.hi = index;
        w.draw();
        thud();
        if (done) done();
      }
      w.raf = requestAnimationFrame(frame);
    };
    w.stop = function () { cancelAnimationFrame(w.raf); w.spinning = false; };
    return w;
  }

  function wheelItems(ids) {
    var firsts = {};
    ids.forEach(function (id) { var f = P(id).firstName.toUpperCase(); firsts[f] = (firsts[f] || 0) + 1; });
    return ids.map(function (id) {
      var p = P(id);
      var label = p.firstName;
      if (firsts[p.firstName.toUpperCase()] > 1 && p.lastName) label += ' ' + p.lastName.charAt(0) + '.';
      return { id: id, label: label.toUpperCase(), sub: p.nickname ? p.nickname.toUpperCase() : '' };
    });
  }

  /* ---------- pecas de interface ---------- */
  function sideF(p, f, right) {
    var cls = 'side-f' + (right ? ' r' : '');
    if (f && f.winner) cls += f.winner === p.id ? ' win' : ' lose';
    return h('div', { class: cls },
      h('img', { src: UI.photo(p), alt: '', loading: 'lazy' }),
      h('div', { style: { minWidth: '0' } },
        h('b', null, p.firstName),
        h('small', null, p.nickname ? '"' + p.nickname + '"' : UI.ART[p.bestArt] || '')));
  }

  /* Numero da luta dentro da rodada (a ordem global tem buracos quando uma luta e desfeita). */
  function numIn(r, f) {
    var list = r.fights.slice().sort(function (a, b) { return a.order - b.order; });
    return list.indexOf(list.filter(function (x) { return x.id === f.id; })[0]) + 1;
  }

  function fightRow(f, admin, n) {
    var last;
    if (admin && !f.winner && !f.extra) {
      last = h('div', { class: 'when-t' }, h('button', {
        class: 'btn ghost sm', type: 'button', disabled: S && S.phase !== 'idle',
        onclick: function (e) { undo(f, e.currentTarget); },
      }, 'Desfazer'));
    } else {
      last = h('div', { class: 'when-t' }, f.winner ? 'Venceu ' + P(f.winner).firstName : (f.extra ? 'Luta extra' : 'Aguarda'));
    }
    return h('div', { class: 'fight' + (f.extra ? ' rl-extra' : '') },
      h('div', { class: 'no' }, n),
      sideF(P(f.a), f, false), h('div', { class: 'vs' }, 'x'), sideF(P(f.b), f, true), last);
  }

  function fgt(p, side) {
    return h('div', { class: 'fgt ' + side },
      h('div', { class: 'fgt-doll' }, h('img', { class: 'doll', src: UI.doll(p.bestArt), alt: '' })),
      h('div', { class: 'fgt-n' },
        h('img', { class: 'face', src: UI.photo(p), alt: UI.full(p) }),
        h('b', null, p.firstName),
        p.nickname ? h('i', null, '"' + p.nickname + '"') : null,
        p.lastName ? h('b', { class: 'ln' }, p.lastName) : null,
        h('small', { class: 'rl-art' }, UI.ART[p.bestArt] || '')));
  }

  function duel(a, b, tag, acts) {
    return h('div', { class: 'reveal' },
      h('div', { class: 'rv-tag' }, UI.tag(tag)),
      h('div', { class: 'duel' }, fgt(P(a), 'a'), h('div', { class: 'vsx', 'aria-label': 'contra' }, 'VS'), fgt(P(b), 'b')),
      acts ? h('div', { class: 'acts' }, acts) : null);
  }

  function showOverlay(node) {
    if (S && S.close) S.close();
    var close = UI.overlay(node);
    if (S) S.close = function () { close(); if (S) S.close = null; };
    return S ? S.close : close;
  }

  function adminFail(e) {
    if (e && e.status === 401) {
      UI.ls.del('adm');
      App.drawNav();
      UI.toast('Sessão de admin expirou. Entre de novo no painel.', true);
      if (S) { S.phase = 'idle'; draw(); }
      return;
    }
    UI.toast((e && e.message) || 'Algo deu errado.', true);
  }

  /* ---------- modo da tela ---------- */
  function mode() {
    var t = tour();
    if (!t) return 'none';
    if (t.phase !== 'swiss') return 'playoff';
    var r = curRound(t);
    if (!r || r.type !== 'swiss') return 'playoff';
    if (!App.isAdmin()) return 'visitor';
    return r.pending.length ? 'spin' : 'done';
  }

  function signature() {
    var t = tour();
    var r = curRound(t);
    return [mode(), r ? r.id : '', r ? r.pending.slice().sort().join(',') : ''].join('|');
  }

  function fightIds() {
    var r = curRound(tour());
    return r ? r.fights.map(function (f) { return f.id; }) : [];
  }

  /* ---------- telas ---------- */
  function head() {
    return [
      h('header', { class: 'ph slim' },
        h('h1', { class: 'page-title' }, 'Roleta'),
        h('p', { class: 'page-sub' }, App.isAdmin()
          ? 'Dois giros por luta: o primeiro tira quem luta, o segundo tira o adversário entre os de nível parecido.'
          : 'Quem gira é o Alisson, na hora. Cada luta que sair aparece aqui pra todo mundo.')),
    ];
  }

  function statusBar(t, r) {
    var done = r.fights.filter(function (f) { return !f.extra; }).length;
    return h('div', { class: 'status-bar' },
      h('div', { class: 'on' }, h('b', null, r.name), h('small', null, 'de ' + t.K + ' de classificação')),
      h('div', null, h('b', null, done), h('small', null, 'lutas sorteadas')),
      h('div', null, h('b', null, Math.floor(r.pending.length / 2)), h('small', null, 'faltam sortear')));
  }

  function notes(r) {
    var out = [];
    r.byes.forEach(function (id) {
      out.push(h('div', { class: 'warn rl-note' }, h('b', null, 'Descansa'), UI.full(P(id)) + ' fica de fora desta rodada (deu número ímpar). Na próxima é outro.'));
    });
    if (r.extra) {
      var has = r.fights.some(function (f) { return f.extra; });
      out.push(h('div', { class: 'warn rl-note' }, h('b', null, 'Luta extra'), UI.full(P(r.extra)) + (has
        ? ' luta duas vezes nesta rodada pra ninguém ficar sem lutar.'
        : ' vai lutar duas vezes nesta rodada. O adversário extra é sorteado sozinho quando todo mundo tiver luta.')));
    }
    return out;
  }

  function pendingBox(r) {
    if (!r.pending.length) return null;
    return h('div', { class: 'rl-pendbox' },
      h('div', { class: 'lbl' }, 'Ainda sem luta (' + r.pending.length + ')'),
      h('div', { class: 'chips rl-pend' }, r.pending.map(function (id) { return h('span', { class: 'chip' }, UI.full(P(id))); })));
  }

  function listBox(r, admin) {
    var fights = r.fights.slice().sort(function (a, b) { return a.order - b.order; });
    return h('div', { class: 'pairs-list' },
      h('div', { class: 'sec' }, 'Confrontos', h('small', null, r.name)),
      fights.length ? fights.map(function (f, i) { return fightRow(f, admin, i + 1); }) : h('div', { class: 'empty' }, 'Nenhuma luta sorteada ainda.'));
  }

  function draw() {
    if (!S) return;
    var el = S.el;
    if (S.wheel) { S.rot = S.wheel.rot; S.wheel.stop(); S.wheel = null; }
    S.sig = signature();
    S.parts = {};
    var t = tour();
    var r = curRound(t);
    var m = mode();

    if (m === 'none') {
      el.replaceChildren.apply(el, head().concat([
        h('div', { class: 'empty' }, 'O torneio ainda não começou. A roleta abre quando o Alisson der a largada.'),
        App.isAdmin() ? h('div', { class: 'row', style: { marginTop: '18px' } }, h('a', { class: 'btn', href: '#/admin' }, 'Ir para o painel (aba Torneio)')) : null,
      ]).filter(Boolean));
      return;
    }
    if (m === 'playoff') {
      var fin = t.phase === 'finished';
      el.replaceChildren.apply(el, head().concat([
        h('div', { class: 'empty' }, fin
          ? 'O torneio acabou. Veja o campeão e todos os resultados no chaveamento.'
          : 'A classificação acabou. Agora é mata-mata: os confrontos saem pela tabela, sem roleta.'),
        h('div', { class: 'row', style: { marginTop: '18px' } }, h('a', { class: 'btn', href: '#/chaveamento' }, 'Ver chaveamento')),
      ]));
      return;
    }

    var parts = S.parts;
    parts.status = h('div', null, statusBar(t, r));
    parts.notes = h('div', null, notes(r));
    parts.list = h('div', null, listBox(r, m !== 'visitor'));

    if (m === 'visitor') {
      parts.pend = h('div', null, pendingBox(r));
      el.replaceChildren.apply(el, head().concat([parts.status, parts.notes, parts.pend, parts.list]));
      return;
    }

    if (m === 'done') {
      el.replaceChildren.apply(el, head().concat([
        parts.status,
        h('div', { class: 'rl-done' },
          h('h2', { class: 'd' }, 'Rodada sorteada'),
          h('p', { class: 'mute' }, 'Todo mundo já tem adversário. Agora é lutar e marcar os resultados no chaveamento.'),
          h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/chaveamento' }, 'Registrar resultados'),
            r.extra && !r.fights.some(function (f) { return f.extra; })
              ? h('button', { class: 'btn ghost', type: 'button', onclick: onAuto }, 'Sortear a luta extra') : null)),
        parts.notes, parts.list,
      ]));
      return;
    }

    // modo roleta (admin com lutadores sem luta)
    var wrap = h('div', { class: 'wheel-wrap' });
    parts.pa = h('div', { class: 'pick-line' }, '—');
    parts.pb = h('div', { class: 'pick-line' }, '—');
    parts.msg = h('p', { class: 'mute rl-msg' });
    parts.spin = h('button', { class: 'btn big block', type: 'button', onclick: onSpin }, 'Girar');
    parts.mute = h('button', { class: 'btn ghost sm', type: 'button', onclick: toggleMute });
    parts.auto = h('button', { class: 'btn ghost sm', type: 'button', onclick: onAuto }, 'Sortear o resto automático');
    parts.reset = h('button', { class: 'btn ghost sm', type: 'button', onclick: function () { reset(); } }, 'Recomeçar este sorteio');
    parts.pend = h('div', null, pendingBox(r));

    el.replaceChildren.apply(el, head().concat([
      parts.status,
      h('div', { class: 'rl' },
        h('div', null,
          h('div', { class: 'rl-pick' },
            h('div', null, h('div', { class: 'lbl' }, '1º giro · quem luta'), parts.pa),
            h('div', { class: 'rl-x' }, 'x'),
            h('div', null, h('div', { class: 'lbl' }, '2º giro · contra quem'), parts.pb)),
          wrap,
          h('div', { class: 'rl-ctl' }, parts.spin, h('div', { class: 'row' }, parts.mute, parts.reset))),
        h('div', null,
          parts.msg,
          parts.pend,
          h('div', { class: 'row', style: { margin: '16px 0 4px' } }, parts.auto),
          h('p', { class: 'hint' }, 'O automático forma todos os pares que faltam de uma vez, pelo nível. Usa se tiver sem tempo.'),
          parts.notes)),
      parts.list,
    ]));

    S.wheel = Wheel(wrap, S.rot);
    S.wheel.size();
    if (S.phase === 'idle') S.wheel.set(wheelItems(r.pending), '1º');
    setUI();
  }

  /* Atualiza so o que e seguro durante um giro (nao toca na roleta). */
  function updateSafe() {
    var t = tour();
    var r = curRound(t);
    var p = S.parts;
    if (!r || !p.list) return;
    p.status.replaceChildren(statusBar(t, r));
    p.notes.replaceChildren.apply(p.notes, notes(r));
    p.list.replaceChildren(listBox(r, mode() !== 'visitor'));
    if (p.pend && mode() === 'visitor') p.pend.replaceChildren(pendingBox(r) || '');
  }

  function setUI() {
    var p = S && S.parts;
    if (!p || !p.spin) return;
    var ph = S.phase;
    var busy = ph === 'spin1' || ph === 'spin2' || ph === 'busy' || ph === 'load' || ph === 'reveal';
    p.spin.disabled = busy;
    p.auto.disabled = ph !== 'idle';
    p.reset.hidden = ph !== 'pick2';
    p.spin.textContent = ph === 'pick2' || ph === 'spin2' ? 'Girar adversário' : 'Girar';
    if (ph === 'spin1' || ph === 'spin2') p.spin.textContent = 'Girando...';
    if (ph === 'load') p.spin.textContent = 'Buscando adversários...';
    p.mute.textContent = muted() ? 'Som: desligado' : 'Som: ligado';
    p.pa.textContent = S.a ? UI.full(P(S.a)) : '—';
    p.pb.textContent = S.b && ph !== 'pick2' && ph !== 'spin2' ? UI.full(P(S.b)) : '—';
    p.pa.classList.toggle('on', !!S.a);
    p.pb.classList.toggle('on', !!S.b && ph !== 'pick2' && ph !== 'spin2');
    var msg = {
      idle: 'Gira pra sortear quem luta agora. Todo mundo que ainda não tem luta tá na roleta.',
      spin1: 'Girando...',
      load: 'Procurando adversários do mesmo nível...',
      pick2: S.cands ? 'Na roleta agora: os ' + S.cands.length + ' adversários mais justos pro ' + (S.a ? P(S.a).firstName : '') + '. Gira pra escolher um.' : '',
      spin2: 'Girando...',
      reveal: 'Confirma a luta ou gira o adversário de novo.',
      busy: 'Salvando...',
    }[ph] || '';
    p.msg.textContent = msg;
    // botoes de desfazer ficam travados durante o sorteio
    p.list.querySelectorAll('button').forEach(function (b) { b.disabled = ph !== 'idle'; });
  }

  function toggleMute() {
    if (muted()) { UI.ls.del('rl-mute'); unlockAudio(); } else UI.ls.set('rl-mute', '1');
    setUI();
  }

  function reset() {
    if (!S) return;
    S.phase = 'idle';
    S.a = S.b = null;
    S.cands = null;
    if (S.dirty || signature() !== S.sig) { S.dirty = false; draw(); return; }
    var r = curRound(tour());
    if (S.wheel && r) S.wheel.set(wheelItems(r.pending), '1º');
    setUI();
  }

  function onSpin() {
    if (!S || !S.wheel || S.wheel.spinning) return;
    unlockAudio();
    if (S.phase === 'idle') {
      var r = curRound(tour());
      if (!r || !r.pending.length) return;
      var ids = r.pending.slice();
      S.wheel.set(wheelItems(ids), '1º');
      var i = rand(ids.length);
      S.phase = 'spin1';
      setUI();
      S.wheel.spin(i, function () {
        if (!S) return;
        S.a = ids[i];
        loadCands();
      });
    } else if (S.phase === 'pick2') {
      spin2();
    }
  }

  function loadCands() {
    S.phase = 'load';
    setUI();
    var a = S.a;
    UI.api('GET', '/api/admin/candidates?fighter=' + encodeURIComponent(a), undefined, 'admin').then(function (d) {
      if (!S || S.a !== a) return;
      var c = (d.candidates || []).filter(function (x) { return App.person(x.id); });
      if (!c.length) { UI.toast('Não achei adversário livre pro ' + P(a).firstName + '. Usa o sorteio automático.', true); reset(); return; }
      S.cands = c;
      if (c.length === 1) {
        S.b = c[0].id;
        S.phase = 'reveal';
        setUI();
        setTimeout(reveal, 700);
        return;
      }
      setTimeout(function () {
        if (!S || S.a !== a) return;
        S.wheel.set(wheelItems(c.map(function (x) { return x.id; })), '2º');
        S.phase = 'pick2';
        setUI();
      }, 900);
    }).catch(function (e) { adminFail(e); reset(); });
  }

  function spin2() {
    var c = S.cands;
    S.b = null;
    S.wheel.set(wheelItems(c.map(function (x) { return x.id; })), '2º');
    var i = rand(c.length);
    S.phase = 'spin2';
    setUI();
    S.wheel.spin(i, function () {
      if (!S) return;
      S.b = c[i].id;
      S.phase = 'reveal';
      setUI();
      setTimeout(reveal, 600);
    });
  }

  function reveal() {
    if (!S || S.phase !== 'reveal') return;
    var a = S.a;
    var b = S.b;
    var r = curRound(tour());
    var ok = h('button', { class: 'btn big', type: 'button' }, 'Confirmar luta');
    var again = S.cands && S.cands.length > 1 ? h('button', { class: 'btn ghost big', type: 'button' }, 'Girar de novo') : null;
    var cancel = h('button', { class: 'btn ghost', type: 'button' }, 'Cancelar');
    var close = showOverlay(duel(a, b, (r ? r.name + ' · ' : '') + 'Luta sorteada', [ok, again, cancel,
      again ? null : h('p', { class: 'hint rl-one' }, 'Só existe um adversário justo para ' + P(a).firstName + ' agora.')]));
    ok.onclick = function () {
      ok.disabled = true;
      if (again) again.disabled = true;
      S.phase = 'busy';
      UI.api('POST', '/api/admin/round/pair', { a: a, b: b }, 'admin').then(function () {
        close();
        UI.toast('Luta confirmada: ' + P(a).firstName + ' x ' + P(b).firstName);
        return App.refresh(true);
      }).then(function () {
        if (!S) return;
        S.dirty = true;
        reset();
      }).catch(function (e) {
        close();
        adminFail(e);
        if (S) { S.dirty = true; reset(); }
      });
    };
    if (again) again.onclick = function () { close(); S.phase = 'pick2'; setUI(); spin2(); };
    cancel.onclick = function () { close(); reset(); };
  }

  function onAuto() {
    if (!S || S.phase !== 'idle') return;
    if (!confirm('Sortear automaticamente todos os confrontos que faltam nesta rodada?')) return;
    S.phase = 'busy';
    setUI();
    UI.api('POST', '/api/admin/round/auto', {}, 'admin').then(function () {
      UI.toast('Rodada sorteada no automático');
      return App.refresh(true);
    }).then(function () { if (S) { S.dirty = true; reset(); } })
      .catch(function (e) { adminFail(e); if (S) { S.dirty = true; reset(); } });
  }

  function undo(f, btn) {
    if (!S || S.phase !== 'idle') return;
    if (!confirm('Desfazer a luta ' + P(f.a).firstName + ' x ' + P(f.b).firstName + '? Os dois voltam para a roleta.')) return;
    btn.disabled = true;
    UI.api('DELETE', '/api/admin/fight/' + encodeURIComponent(f.id), undefined, 'admin').then(function () {
      UI.toast('Luta desfeita');
      return App.refresh(true);
    }).then(function () { if (S && S.phase === 'idle') { S.dirty = true; reset(); } })
      .catch(function (e) { btn.disabled = false; adminFail(e); });
  }

  /* ---------- revelacao para quem esta assistindo ---------- */
  function queueReveal(list) {
    S.queue = S.queue.concat(list);
    if (!S.showing) nextReveal();
  }
  function nextReveal() {
    if (!S) return;
    var f = S.queue.shift();
    if (!f) { S.showing = false; if (S.close) S.close(); return; }
    S.showing = true;
    var r = curRound(tour());
    var left = S.queue.length;
    var btn = h('button', { class: 'btn big', type: 'button', onclick: nextReveal }, left ? 'Próxima luta (' + left + ')' : 'Fechar');
    showOverlay(duel(f.a, f.b, (f.extra ? 'Luta extra' : 'Nova luta') + (r ? ' · ' + r.name + ' · Luta ' + numIn(r, f) : ''), [btn]));
  }

  function onKey(e) {
    if (e.key !== 'Escape' || !S || !S.close) return;
    if (S.showing) { S.queue = []; nextReveal(); }
  }

  function onResize() { if (S && S.wheel) S.wheel.size(); }

  App.route('#/roleta', {
    title: 'Roleta',
    render: function (el) {
      if (S) leave();
      S = { el: el, phase: 'idle', a: null, b: null, cands: null, rot: 0, seen: {}, queue: [], showing: false, close: null, dirty: false };
      fightIds().forEach(function (id) { S.seen[id] = 1; });
      window.addEventListener('resize', onResize);
      document.addEventListener('keydown', onKey);
      draw();
      if (document.fonts && document.fonts.load) {
        Promise.all([document.fonts.load('400 40px Anton'), document.fonts.load('italic 800 20px Archivo')])
          .then(function () { if (S && S.wheel) S.wheel.draw(); }).catch(function () {});
      }
    },
    onData: function () {
      if (!S) return;
      var r = curRound(tour());
      var fresh = r ? r.fights.filter(function (f) { return !S.seen[f.id]; }) : [];
      fresh.forEach(function (f) { S.seen[f.id] = 1; });
      fresh.sort(function (a, b) { return a.order - b.order; });
      if (!App.isAdmin() && fresh.length) queueReveal(fresh);
      else if (App.isAdmin()) {
        fresh.filter(function (f) { return f.extra; }).forEach(function (f) {
          UI.toast('Luta extra sorteada: ' + P(f.a).firstName + ' x ' + P(f.b).firstName);
        });
      }
      if (S.phase !== 'idle') { S.dirty = true; updateSafe(); setUI(); return; }
      if (signature() !== S.sig) draw(); else { updateSafe(); setUI(); }
    },
    leave: leave,
  });

  function leave() {
    if (!S) return;
    if (S.wheel) S.wheel.stop();
    if (S.close) S.close();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey);
    S = null;
  }
})();
