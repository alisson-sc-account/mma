/* Painel do admin (Alisson): conferir e aprovar cadastros, avaliar lutadores, torneio e ajustes. */
(function () {
  var h = UI.h;
  var A = null; // estado da tela enquanto ela esta aberta
  var TABS = [['pend', 'Pendentes'], ['ok', 'Aprovados'], ['rej', 'Recusados'], ['tour', 'Torneio'], ['set', 'Ajustes']];
  var PLAYOFF = { top4: 'Semi + final', final: 'Final', none: 'Sem mata-mata' };
  var PHASE = { swiss: 'Classificação', playoffs: 'Mata-mata', finished: 'Encerrado' };

  /* ---------- servidor ---------- */
  function api(method, url, body) {
    return UI.api(method, url, body, 'admin').catch(function (e) {
      if (e.status === 401) kick();
      throw e;
    });
  }
  function fail(e) { if (e && e.status !== 401) UI.toast(e.message || 'Algo deu errado.', true); }
  function kick() {
    UI.ls.del('adm');
    App.drawNav();
    UI.toast('Sessão de admin expirou. Entre de novo.', true);
    if (A) { A.data = null; A.open = {}; drawLogin(); }
  }
  function load(force) {
    if (!A || !App.isAdmin()) return Promise.resolve();
    return api('GET', '/api/admin/state').then(function (d) {
      if (!A) return;
      var changed = !A.data || A.data.v !== d.v;
      A.data = d;
      if (changed || force) draw();
    }).catch(fail);
  }
  function refreshAll() { App.refresh(true); return load(true); }

  /* Nao atualiza sozinho enquanto o admin esta mexendo em algo. */
  function busy() {
    if (!A) return true;
    if (A.saving || Object.keys(A.open).length) return true;
    if (A.tab === 'set' && A.setDirty) return true;
    var f = document.activeElement;
    if (f && A.el.contains(f) && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) return true;
    return document.getElementById('overlay').className === 'on';
  }
  function startTimer() {
    stopTimer();
    A.timer = setInterval(function () { if (A && !document.hidden && !busy()) load(); }, 5000);
  }
  function stopTimer() { if (A && A.timer) { clearInterval(A.timer); A.timer = null; } }

  /* ---------- utilidades ---------- */
  function ago(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'agora mesmo';
    if (m < 60) return 'há ' + m + ' min';
    if (m < 1440) return 'há ' + Math.floor(m / 60) + ' h';
    return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function bestOf(arts, scores) {
    var best = null;
    var top = 0;
    arts.forEach(function (a) {
      var s = Number(scores[a]) || 0;
      if (s > top) { best = a; top = s; }
    });
    return best || arts[0];
  }
  function foodText(r) {
    return r.food.map(function (f) { return f === 'Outros' && r.foodOther ? 'Outros (' + r.foodOther + ')' : f; }).join(', ');
  }
  function inTour(r) {
    var t = A.data && A.data.tournament;
    return !!(t && t.fighters.indexOf(r.id) >= 0);
  }
  function btn(label, cls, fn) {
    return h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: function (e) { fn(e.currentTarget); } }, label);
  }
  function kv(pairs) {
    return h('dl', { class: 'kv' }, pairs.filter(Boolean).map(function (p) { return [h('dt', null, p[0]), h('dd', null, p[1])]; }));
  }

  function zoom(r) {
    var close;
    var box = h('div', { class: 'adm-zoom', onclick: function () { close(); } },
      h('img', { class: 'zoom', src: UI.photo(r), alt: UI.full(r) }),
      h('div', { class: 'adm-zoom-cap' }, UI.full(r) + ' · @' + r.username),
      h('button', { class: 'btn ghost sm', type: 'button' }, 'Fechar'));
    close = UI.overlay(box);
    A.close = close;
  }
  function photoEl(r) {
    return h('img', { class: 'ph', src: UI.photo(r), alt: 'Foto de ' + UI.full(r), loading: 'lazy', onclick: function () { zoom(r); } });
  }

  /* ---------- acoes ---------- */
  function act(b, method, url, body, ok) {
    b.disabled = true;
    A.saving = true;
    return api(method, url, body).then(function () {
      A.saving = false;
      if (ok) UI.toast(ok);
      return refreshAll();
    }).catch(function (e) { A.saving = false; b.disabled = false; fail(e); });
  }
  function reject(r, b) {
    if (!confirm('Recusar o cadastro de ' + UI.full(r) + ' (@' + r.username + ')?')) return;
    act(b, 'POST', '/api/admin/reg/' + r.id + '/reject', {}, 'Cadastro recusado');
  }
  function toPending(r, b) {
    if (!confirm('Voltar ' + UI.full(r) + ' para pendente? A avaliação fica guardada.')) return;
    delete A.open[r.id];
    act(b, 'POST', '/api/admin/reg/' + r.id + '/pending', {}, 'Voltou para pendentes');
  }
  function remove(r, b) {
    if (!confirm('Remover de vez o cadastro de ' + UI.full(r) + ' (@' + r.username + ')? A foto também é apagada e não dá para desfazer.')) return;
    delete A.open[r.id];
    act(b, 'DELETE', '/api/admin/reg/' + r.id, undefined, 'Cadastro removido');
  }
  function approveSpectator(r, b, doll) {
    act(b, 'POST', '/api/admin/reg/' + r.id + '/approve', { role: 'spectator', doll: doll },
      'Aprovado como plateia. Ele já entra na conta da pizza.');
  }

  /* ---------- avaliacao do lutador ---------- */
  function slider(label, min, max, val, onInput) {
    var out = h('output', null, val);
    var inp = h('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(val), 'aria-label': label });
    inp.addEventListener('input', function () { out.textContent = inp.value; onInput(Number(inp.value)); });
    return h('div', { class: 'sl' }, h('span', null, label), inp, out);
  }

  function evalForm(r, editing) {
    var st = A.open[r.id];
    var err = h('div', { class: 'err', hidden: true });
    var doll = h('img', { class: 'ev-doll', alt: '' });
    var num = h('b', { class: 'ev-num' });
    var bar = h('i');
    var bestLine = h('div', { class: 'lvl' });
    var sizeNote = h('div', { class: 'hint', hidden: true }, 'Sem peso ou altura, a prévia usa 60 kg e 165 cm.');

    function upd() {
      var rt = UI.rating(st.scores, st.strength, st.weight, st.height);
      var best = st.doll && r.arts.indexOf(st.doll) >= 0 ? st.doll : bestOf(r.arts, st.scores);
      num.textContent = rt.toFixed(1).replace('.', ',');
      bar.style.width = Math.max(0, Math.min(100, rt)) + '%';
      bestLine.textContent = 'Boneco do perfil: ' + UI.ART[best] + (st.doll ? ' (escolhido por você)' : ' (arte de maior nota)');
      doll.src = UI.doll(best);
      sizeNote.hidden = !!(st.weight && st.height);
    }
    var weight = h('input', { type: 'number', inputmode: 'decimal', min: '30', max: '200', step: '0.5', placeholder: 'ex.: 62', value: st.weight || '' });
    var height = h('input', { type: 'number', inputmode: 'numeric', min: '120', max: '230', step: '1', placeholder: 'ex.: 172', value: st.height || '' });
    var dsel = h('select', { 'aria-label': 'Boneco do perfil' },
      h('option', { value: '' }, 'Automático: arte de maior nota'),
      r.arts.map(function (a) { return h('option', { value: a }, UI.ART[a]); }));
    dsel.value = st.doll || '';
    dsel.addEventListener('change', function () { st.doll = dsel.value || null; upd(); });
    weight.addEventListener('input', function () { st.weight = weight.value; upd(); });
    height.addEventListener('input', function () { st.height = height.value; upd(); });

    var save = btn(editing ? 'Salvar avaliação' : 'Aprovar lutador', '', function (b) {
      var w = Number(st.weight);
      var hh = Number(st.height);
      var msg = !(w >= 30 && w <= 200) ? 'Coloque o peso aproximado em kg (30 a 200).'
        : !(hh >= 120 && hh <= 230) ? 'Coloque a altura em cm (120 a 230).' : '';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      err.hidden = true;
      b.disabled = true;
      A.saving = true;
      var scores = {};
      r.arts.forEach(function (a) { scores[a] = st.scores[a]; });
      api('POST', '/api/admin/reg/' + r.id + '/approve', { role: 'fighter', scores: scores, strength: st.strength, weight: w, height: hh, doll: st.doll || null }).then(function () {
        A.saving = false;
        delete A.open[r.id];
        var left = A.data.regs.filter(function (x) { return x.status === 'pending' && x.id !== r.id; }).length;
        var t = A.data.tournament;
        UI.toast(editing ? 'Avaliação salva' : t
          ? 'Aprovado, mas o torneio já começou: ele não entra nas lutas.'
          : left ? 'Lutador aprovado. Faltam ' + left + ' pendente(s); depois, aba Torneio.' : 'Lutador aprovado. Quando todos chegarem, comece o torneio na aba Torneio.');
        return refreshAll();
      }).catch(function (e) { A.saving = false; b.disabled = false; fail(e); });
    });
    var cancel = btn('Cancelar', 'ghost', function () { delete A.open[r.id]; draw(); });

    var box = h('div', { class: 'eval' },
      h('div', { class: 'lbl' }, editing ? 'Editar avaliação' : 'Avaliação do lutador'),
      h('p', { class: 'hint ev-note' }, 'Nota de 1 a 10 em cada arte que ele marcou. Eles têm 15-16 anos: 10 aqui é o melhor da turma, tipo um 6 de profissional. Dá nota honesta, é isso que deixa as lutas justas.'),
      h('div', { class: 'ev-grid' },
        h('div', null,
          r.arts.map(function (a) { return slider(UI.ART[a], 1, 10, st.scores[a], function (v) { st.scores[a] = v; upd(); }); }),
          h('div', { class: 'ev-gap' }),
          slider('Força', 1, 15, st.strength, function (v) { st.strength = v; upd(); }),
          h('p', { class: 'hint' }, 'Força de 1 a 15: só você mede (queda de braço, empurrão, pegada).'),
          h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', null, 'Boneco do perfil'), dsel,
            h('div', { class: 'hint' }, 'Quem define é você, não o lutador. No automático vale a arte em que ele tirou a maior nota.')),
          h('div', { class: 'two', style: { marginTop: '14px' } },
            h('div', { class: 'field' }, h('label', null, 'Peso (kg)'), weight),
            h('div', { class: 'field' }, h('label', null, 'Altura (cm)'), height))),
        h('div', { class: 'ev-prev' },
          doll,
          h('div', null,
            h('div', { class: 'lbl' }, 'Nível geral'),
            num, h('small', { class: 'mute' }, ' / 100'),
            h('div', { class: 'ev-bar' }, bar),
            bestLine, sizeNote))),
      err,
      h('div', { class: 'row', style: { marginTop: '12px' } }, save, cancel));
    upd();
    return box;
  }

  function openEval(r) {
    var scores = {};
    r.arts.forEach(function (a) { scores[a] = (r.scores && r.scores[a]) || 5; });
    A.open[r.id] = { scores: scores, strength: r.strength || 8, weight: r.weight || '', height: r.height || '', doll: r.doll || null };
    draw();
    var card = A.el.querySelector('[data-reg="' + r.id + '"] .eval');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- cartoes ---------- */
  function devBlock(r) {
    var d = r.deviceInfo || { label: 'Aparelho desconhecido', detail: '' };
    var u = r.dups || {};
    var line = function (list, txt) { return list && list.length ? h('div', { class: 'dup' }, txt + list.map(function (x) { return '@' + x; }).join(', ')) : null; };
    return h('div', { class: 'dev' },
      h('div', { class: 'lbl' }, 'Aparelho do cadastro'),
      h('b', null, d.label),
      h('small', null, d.detail),
      line(u.sameDevice, 'Mesmo navegador de: '),
      line(u.lookAlike, 'Aparelho parecido, mesmo Wi-Fi, de: '),
      line(u.sameName, 'Nome igual ao de: '),
      h('div', { class: 'hint' }, 'Compare com o celular que você sabe que ele tem. Se não bater, pode ser alguém usando o nome de outro.'));
  }

  function artChips(r, best) {
    return h('div', { class: 'chips' }, r.arts.map(function (a) {
      return h('span', { class: 'chip' + (a === best ? ' hot' : '') }, UI.ART[a] + (a === best ? ' · melhor' : ''));
    }));
  }

  function pendCard(r) {
    var code = h('input', { type: 'text', class: 'codein', inputmode: 'numeric', maxlength: '6', placeholder: '000000', autocomplete: 'off', value: A.codes[r.id] || '', 'aria-label': 'Código recebido' });
    var chk = h('span', { class: 'chk' });
    function check() {
      var v = code.value.replace(/\D/g, '').slice(0, 6);
      if (v !== code.value) code.value = v;
      A.codes[r.id] = v;
      if (v.length < 6) { chk.className = 'chk'; chk.textContent = v ? 'faltam ' + (6 - v.length) + ' dígitos' : ''; }
      else if (v === r.code) { chk.className = 'chk y'; chk.textContent = 'Confere'; }
      else { chk.className = 'chk n'; chk.textContent = 'Não confere'; }
    }
    code.addEventListener('input', check);
    check();
    var open = !!A.open[r.id];
    var specDoll = h('select', { class: 'spec-doll', 'aria-label': 'Boneco da plateia' },
      r.arts.map(function (a) { return h('option', { value: a }, 'Boneco: ' + UI.ART[a]); }));
    return h('div', { class: 'reg', 'data-reg': r.id },
      photoEl(r),
      h('div', { class: 'reg-body' },
        h('h3', null, UI.full(r), h('small', null, '@' + r.username)),
        r.nickname ? h('div', { class: 'reg-nick' }, '"' + r.nickname + '"') : h('div', { class: 'reg-nick mute' }, 'Sem apelido'),
        kv([['Artes', artChips(r, null)], ['Vai levar', foodText(r)], ['Cadastro', ago(r.createdAt)]]),
        h('div', { class: 'reg-codes' },
          h('div', null, h('div', { class: 'lbl' }, 'Senha'), h('div', { class: 'codebox pw' }, r.password)),
          h('div', null, h('div', { class: 'lbl' }, 'Código'), h('div', { class: 'codebox' }, r.code))),
        h('div', { class: 'reg-chk' }, h('div', { class: 'lbl' }, 'Conferir código recebido no WhatsApp'), h('div', { class: 'row' }, code, chk)),
        devBlock(r),
        open ? null : h('div', { class: 'row reg-acts' },
          btn('Recusar', 'ghost sm', function (b) { reject(r, b); }),
          specDoll,
          btn('Aprovar como plateia', 'ghost sm', function (b) { approveSpectator(r, b, specDoll.value); }),
          btn('Aprovar como lutador', 'sm', function () { openEval(r); })),
        open ? evalForm(r, false) : null));
  }

  function doneCard(r) {
    var fighter = r.role === 'fighter';
    var open = !!A.open[r.id];
    var rej = r.status === 'rejected';
    var locked = inTour(r);
    return h('div', { class: 'reg done cmp', 'data-reg': r.id },
      photoEl(r),
      h('div', { class: 'reg-body' },
        h('h3', null, UI.full(r), h('small', null, '@' + r.username)),
        h('div', { class: 'chips', style: { margin: '6px 0 8px' } },
          rej ? h('span', { class: 'chip' }, 'Recusado') : h('span', { class: 'chip' + (fighter ? ' hot' : '') }, fighter ? 'Lutador' : 'Plateia'),
          locked ? h('span', { class: 'chip gold' }, 'No torneio') : null,
          r.nickname ? h('span', { class: 'chip' }, '"' + r.nickname + '"') : null),
        fighter && !rej ? h('div', { class: 'cmp-line' },
          h('b', null, 'Nível ' + String(r.rating).replace('.', ',')),
          ' · melhor arte ' + UI.ART[r.bestArt] + ' · força ' + r.strength + ' · ' + r.weight + ' kg · ' + r.height + ' cm') : null,
        fighter && !rej ? h('div', { class: 'cmp-line mute' }, r.arts.map(function (a) { return UI.ART[a] + ' ' + (r.scores[a] || '-'); }).join(' · ')) : null,
        h('div', { class: 'cmp-line mute' }, 'Leva: ' + foodText(r)),
        rej ? h('div', { class: 'cmp-line mute' }, (r.deviceInfo && r.deviceInfo.label) + ' · cadastro ' + ago(r.createdAt)) : null,
        open ? null : h('div', { class: 'row reg-acts' },
          rej ? null : btn(fighter ? 'Editar avaliação' : 'Avaliar como lutador', 'ghost sm', function () { openEval(r); }),
          btn('Voltar para pendente', 'ghost sm', function (b) { toPending(r, b); }),
          btn('Remover', 'ghost sm', function (b) { remove(r, b); })),
        locked && !open ? h('div', { class: 'hint' }, 'Está no torneio: dá para editar a avaliação, mas para tirar ou remover precisa reiniciar o torneio.') : null,
        open ? evalForm(r, true) : null));
  }

  /* ---------- abas ---------- */
  function tabPend(list) {
    if (!list.length) return h('div', { class: 'empty' }, 'Nenhum cadastro esperando. Quando alguém se cadastrar, aparece aqui (atualiza sozinho).');
    return h('div', null,
      h('div', { class: 'warn' }, h('b', null, 'Antes de aprovar'), 'Vê se o código que a pessoa mandou no WhatsApp confere, se a foto é do rosto dela e se o aparelho bate com o celular dela.'),
      list.map(pendCard));
  }

  function tabOk(list) {
    if (!list.length) return h('div', { class: 'empty' }, 'Ninguém aprovado ainda.');
    var f = list.filter(function (r) { return r.role === 'fighter'; });
    var s = list.filter(function (r) { return r.role !== 'fighter'; });
    return h('div', null,
      h('div', { class: 'sec' }, 'Lutadores', h('small', null, f.length)),
      f.length ? f.map(doneCard) : h('div', { class: 'empty' }, 'Nenhum lutador aprovado.'),
      h('div', { class: 'sec' }, 'Plateia', h('small', null, s.length)),
      s.length ? s.map(doneCard) : h('div', { class: 'empty' }, 'Ninguém na plateia.'));
  }

  function tabRej(list) {
    if (!list.length) return h('div', { class: 'empty' }, 'Nenhum cadastro recusado.');
    return h('div', null, h('p', { class: 'page-sub' }, 'Recusados não aparecem no site e o usuário fica livre para outra pessoa usar.'), list.map(doneCard));
  }

  function planBox(p, s) {
    var over = p.estMinutes > (Number(s.totalMin) || 0);
    return h('div', { class: 'figs adm-plan' },
      h('div', null, h('b', null, p.n), h('small', null, 'lutadores aprovados')),
      h('div', null, h('b', null, p.rounds), h('small', null, 'rodadas de classificação')),
      h('div', null, h('b', null, PLAYOFF[p.playoff] || '-'), h('small', null, 'mata-mata')),
      h('div', null, h('b', null, p.totalFights), h('small', null, 'lutas no total')),
      h('div', { class: over ? 'over' : '' }, h('b', null, p.estMinutes + ' min'), h('small', null, 'estimado')),
      h('div', null, h('b', null, s.totalMin + ' min'), h('small', null, 'tempo disponível')));
  }

  function tabTour() {
    var d = A.data;
    var t = d.tournament;
    var p = d.plan;
    var pend = d.regs.filter(function (r) { return r.status === 'pending'; }).length;
    if (!t) {
      return h('div', null,
        h('div', { class: 'sec' }, 'Plano com os aprovados de agora'),
        planBox(p, d.settings),
        p.warnings.map(function (w) { return h('div', { class: 'warn' }, h('b', null, 'Atenção'), w); }),
        pend ? h('div', { class: 'warn' }, h('b', null, pend + ' pendente(s)'), 'Quem não estiver aprovado como lutador na hora de começar fica de fora das lutas.') : null,
        h('p', { class: 'hint', style: { marginBottom: '16px' } }, 'O plano usa a duração da luta, o intervalo e o tempo total da aba Ajustes. Cada luta: ' + String(p.slot).replace('.', ',') + ' min com intervalo; cabem ' + p.budget + ' lutas.'),
        h('div', { class: 'row' }, btn('Começar torneio', 'big' + (p.n < 2 ? ' off' : ''), function (b) {
          if (!confirm('Começar o torneio agora com ' + p.n + ' lutadores?\n\nA lista de lutadores trava: quem for aprovado depois não entra nas lutas.')) return;
          act(b, 'POST', '/api/admin/tournament/start', {}, 'Torneio começou. Abra a roleta para sortear a Rodada 1.');
        })));
    }
    var cur = t.rounds.filter(function (r) { return r.id === t.currentId; })[0];
    var all = t.rounds.reduce(function (a, r) { return a.concat(r.fights); }, []);
    var done = all.filter(function (f) { return f.winner; }).length;
    var late = d.regs.filter(function (r) { return r.status === 'approved' && r.role === 'fighter' && t.fighters.indexOf(r.id) < 0; });
    var champ = t.champion && d.regs.filter(function (r) { return r.id === t.champion; })[0];
    return h('div', null,
      h('div', { class: 'status-bar' },
        h('div', { class: 'on' }, h('b', null, PHASE[t.phase] || t.phase), h('small', null, 'fase')),
        cur ? h('div', null, h('b', null, cur.name), h('small', null, cur.type === 'swiss' ? 'de ' + t.K + ' de classificação' : 'rodada atual')) : null,
        h('div', null, h('b', null, done + '/' + all.length), h('small', null, 'lutas com resultado')),
        h('div', null, h('b', null, t.fighters.length), h('small', null, 'lutadores no torneio'))),
      champ ? h('div', { class: 'champ sm' },
        h('div', { class: 'champ-doll' }, h('img', { src: UI.doll(champ.bestArt), alt: '' })),
        h('div', { class: 'champ-n' }, h('div', null, UI.tag('Campeão', 'gold')), h('b', null, UI.full(champ)))) : null,
      cur && cur.pending.length ? h('div', { class: 'warn' }, h('b', null, 'Sorteio em andamento'), 'Faltam sortear ' + Math.floor(cur.pending.length / 2) + ' luta(s) da ' + cur.name + '. Use a roleta.') : null,
      t.canAdvance ? h('div', { class: 'warn' }, h('b', null, 'Rodada completa'), 'Todos os resultados foram registrados. Avance para a próxima rodada no chaveamento.') : null,
      late.length ? h('div', { class: 'warn' }, h('b', null, 'Aprovados depois do início'),
        late.map(function (r) { return UI.full(r); }).join(', ') + (late.length > 1 ? ' não entram' : ' não entra') + ' nas lutas deste torneio. Para incluir, só reiniciando.') : null,
      h('div', { class: 'row', style: { margin: '6px 0 30px' } },
        h('a', { class: 'btn', href: '#/roleta' }, 'Abrir a roleta'),
        h('a', { class: 'btn ghost', href: '#/chaveamento' }, 'Abrir o chaveamento')),
      h('div', { class: 'adm-danger' },
        h('div', { class: 'lbl' }, 'Zona de perigo'),
        h('p', { class: 'mute' }, 'Reiniciar apaga todas as lutas, sorteios e resultados. Os cadastros e as avaliações continuam. Depois é só começar de novo.'),
        btn('Reiniciar torneio', 'ghost', function (b) {
          if (!confirm('Reiniciar o torneio? Todas as lutas e resultados serão apagados.')) return;
          if (!confirm('Tem certeza mesmo? Isso não dá para desfazer.')) return;
          act(b, 'POST', '/api/admin/tournament/reset', {}, 'Torneio reiniciado');
        })));
  }

  var SET_FIELDS = [
    ['whatsapp', 'WhatsApp do Alisson', 'text', 'Com DDI e DDD, só números. Ex.: 5511999999999. Se o servidor tiver a variável WHATSAPP_NUMBER, ela manda e este campo é ignorado.', { inputmode: 'numeric', placeholder: '5511999999999' }],
    ['place', 'Local', 'text', 'Aparece no início e no menu.', { maxlength: '60' }],
    ['startTime', 'Horário de início', 'time', 'HH:MM. A contagem regressiva conta até esse horário na sexta.', {}],
    ['pizzaTotal', 'Total das pizzas (R$)', 'number', 'Valor total que vai ser rachado entre todo mundo.', { min: '0', max: '5000', step: '1', inputmode: 'decimal' }],
    ['extraPeople', 'Pessoas extras no racha', 'number', 'Quem racha a pizza mas não tem cadastro (irmão, primo...).', { min: '0', max: '50', step: '1', inputmode: 'numeric' }],
    ['fightMin', 'Duração de cada luta (min)', 'number', 'Tempo médio de uma luta, contando a entrada.', { min: '1', max: '60', step: '0.5', inputmode: 'decimal' }],
    ['restMin', 'Intervalo entre lutas (min)', 'number', 'Descanso e troca de lutadores entre uma luta e outra.', { min: '0', max: '30', step: '0.5', inputmode: 'decimal' }],
    ['totalMin', 'Tempo total (min)', 'number', 'Quanto tempo vocês têm para o torneio inteiro. Define quantas rodadas cabem.', { min: '30', max: '600', step: '5', inputmode: 'numeric' }],
    ['swissRounds', 'Rodadas de classificação', 'number', '0 = automático pelo tempo. Vale para o próximo torneio que começar.', { min: '0', max: '6', step: '1', inputmode: 'numeric' }],
  ];

  function tabSet() {
    var s = A.data.settings;
    var inputs = {};
    var fields = SET_FIELDS.map(function (f) {
      var attrs = Object.assign({ type: f[2], value: s[f[0]] == null ? '' : String(s[f[0]]) }, f[4]);
      var inp = h('input', attrs);
      inp.addEventListener('input', function () { A.setDirty = true; });
      inputs[f[0]] = inp;
      return h('div', { class: 'field' }, h('label', null, f[1]), inp, h('div', { class: 'hint' }, f[3]));
    });
    var save = btn('Salvar ajustes', '', function (b) {
      var body = {};
      SET_FIELDS.forEach(function (f) {
        var v = inputs[f[0]].value.trim();
        body[f[0]] = f[2] === 'number' ? (v === '' ? null : Number(v.replace(',', '.'))) : v;
      });
      body.whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
      if (body.whatsapp && (body.whatsapp.length < 12 || body.whatsapp.length > 13)) {
        UI.toast('WhatsApp: use DDI + DDD + número, ex.: 5511999999999.', true);
        return;
      }
      b.disabled = true;
      A.saving = true;
      api('PUT', '/api/admin/settings', body).then(function () {
        A.saving = false;
        A.setDirty = false;
        return refreshAll();
      }).then(function () {
        var got = A && A.data && A.data.settings.whatsapp;
        if (A && got !== body.whatsapp) UI.toast('Salvo. O WhatsApp veio da variável WHATSAPP_NUMBER do servidor, o campo foi ignorado.');
        else UI.toast('Ajustes salvos');
      }).catch(function (e) { A.saving = false; b.disabled = false; fail(e); });
    });
    return h('div', null,
      h('p', { class: 'page-sub' }, 'Valores fora do limite são ignorados pelo servidor e o valor antigo continua.'),
      h('div', { class: 'set-grid' }, fields),
      h('div', { class: 'row', style: { marginTop: '6px' } }, save,
        btn('Descartar mudanças', 'ghost', function () { A.setDirty = false; draw(); })));
  }

  /* ---------- telas ---------- */
  function drawLogin() {
    stopTimer();
    var el = A.el;
    var pw = h('input', { type: 'password', autocomplete: 'current-password' });
    var err = h('div', { class: 'err', hidden: true });
    var go = h('button', { class: 'btn', type: 'button' }, 'Entrar');
    function submit() {
      if (!pw.value) { err.textContent = 'Digite a senha.'; err.hidden = false; return; }
      go.disabled = true;
      UI.api('POST', '/api/admin/login', { password: pw.value }).then(function (d) {
        UI.ls.set('adm', d.token);
        App.drawNav();
        App.refresh(true);
        if (!A) return;
        el.replaceChildren(h('p', { class: 'mute' }, 'Carregando...'));
        load(true);
        startTimer();
      }).catch(function (e) { go.disabled = false; err.textContent = e.message; err.hidden = false; pw.select(); });
    }
    go.onclick = submit;
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    el.replaceChildren(
      h('div', { class: 'split' },
        h('div', null,
          h('h1', { class: 'page-title' }, 'Admin'),
          h('p', { class: 'page-sub' }, 'Aqui é só o Alisson: aprovar cadastro, dar nota pros lutadores e tocar o torneio.')),
        h('div', { class: 'form-slab' },
          h('div', { class: 'field' }, h('label', null, 'Senha do admin'), pw),
          err,
          h('div', { class: 'row', style: { marginTop: '14px' } }, go))));
    pw.focus();
  }

  function draw() {
    if (!A || !A.data) return;
    var d = A.data;
    var ids = {};
    d.regs.forEach(function (r) { ids[r.id] = 1; });
    Object.keys(A.open).forEach(function (id) { if (!ids[id]) delete A.open[id]; });
    var pend = d.regs.filter(function (r) { return r.status === 'pending'; });
    var ok = d.regs.filter(function (r) { return r.status === 'approved'; });
    var rej = d.regs.filter(function (r) { return r.status === 'rejected'; });
    var count = { pend: pend.length, ok: ok.length, rej: rej.length };
    var body = A.tab === 'ok' ? tabOk(ok) : A.tab === 'rej' ? tabRej(rej) : A.tab === 'tour' ? tabTour() : A.tab === 'set' ? tabSet() : tabPend(pend);
    var y = window.scrollY;
    A.el.replaceChildren(
      h('div', { class: 'adm-head' },
        h('div', null,
          h('h1', { class: 'page-title' }, 'Painel'),
          h('p', { class: 'page-sub' }, 'Só aprova quem você tem certeza que é a pessoa.')),
        btn('Sair do admin', 'ghost sm', function () {
          UI.ls.del('adm');
          App.drawNav();
          A.data = null;
          A.open = {};
          drawLogin();
        })),
      h('div', { class: 'tabs adm-tabs' }, TABS.map(function (t) {
        var n = count[t[0]];
        return h('button', {
          type: 'button', class: A.tab === t[0] ? 'on' : '',
          onclick: function () { if (A.tab === t[0]) return; A.tab = t[0]; A.setDirty = false; UI.ls.set('adm-tab', t[0]); draw(); window.scrollTo(0, 0); },
        }, t[1], n != null ? h('span', { class: 'adm-n' + (t[0] === 'pend' && n ? ' hot' : '') }, n) : null);
      })),
      body);
    window.scrollTo(0, y);
  }

  function onKey(e) {
    if (e.key === 'Escape' && A && A.close && document.getElementById('overlay').className === 'on') { A.close(); A.close = null; }
  }

  App.route('#/admin', {
    title: 'Admin',
    render: function (el) {
      A = { el: el, tab: UI.ls.get('adm-tab') || 'pend', data: null, open: {}, codes: {}, setDirty: false, saving: false, timer: null, close: null };
      document.addEventListener('keydown', onKey);
      if (!App.isAdmin()) { drawLogin(); return; }
      el.replaceChildren(h('p', { class: 'mute' }, 'Carregando...'));
      load(true);
      startTimer();
    },
    leave: function () {
      if (!A) return;
      stopTimer();
      if (A.close) A.close();
      document.removeEventListener('keydown', onKey);
      A = null;
    },
  });
})();
