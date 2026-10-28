/* Cadastro em 5 passos. O rascunho fica so na memoria (a foto nunca vai para o localStorage). */
(function () {
  var h = UI.h;
  var STEPS = ['Quem é você', 'Sua foto', 'Lutas e apelido', 'O que você leva', 'Confere tudo'];
  var FIELD_STEP = { username: 1, firstName: 1, lastName: 1, password: 1, photo: 2, arts: 3, bestPick: 3, nickname: 3, food: 4, foodOther: 4 };
  function re(src, fallback) { try { return new RegExp(src, 'u'); } catch (e) { return fallback; } }
  var NAME_RE = re("^[\\p{L}][\\p{L} '.-]*$", /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '.-]*$/);
  var USER_RE = re('^[\\p{L}\\p{N}._-]+$', /^[A-Za-z0-9À-ÿ._-]+$/);
  var clean = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
  var fold = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var money = function (n) { return 'R$ ' + n.toFixed(2).replace('.', ',').replace(',00', ''); };

  var S = null;
  var root = null;
  var live = null;

  function fresh() {
    return { step: 1, username: '', firstName: '', lastName: '', password: '', photo: '', faceWarn: false,
      arts: [], bestPick: null, nickname: '', food: [], foodOther: '', busy: false, done: null, err: null };
  }

  /* ---------- checagem do usuario ---------- */
  var seq = 0;
  function checkUser(u) {
    var my = ++seq;
    return fetch('/api/check?username=' + encodeURIComponent(u))
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: null, reason: 'Sem conexão para conferir o usuário.' }; })
      .then(function (d) { return my === seq ? d : null; });
  }

  /* ---------- foto ---------- */
  function decode(file) {
    function viaImg() {
      return new Promise(function (res, rej) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { res({ src: img, w: img.naturalWidth, h: img.naturalHeight, done: function () { URL.revokeObjectURL(url); } }); };
        img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); };
        img.src = url;
      });
    }
    if (!window.createImageBitmap) return viaImg();
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .then(function (b) { return { src: b, w: b.width, h: b.height, done: function () { if (b.close) b.close(); } }; })
      .catch(viaImg);
  }

  function cropSquare(file) {
    return decode(file).then(function (d) {
      var side = Math.min(d.w, d.h);
      if (!side) throw new Error('empty');
      var c = document.createElement('canvas');
      c.width = c.height = 480;
      var g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.fillStyle = '#000';
      g.fillRect(0, 0, 480, 480);
      g.drawImage(d.src, (d.w - side) / 2, (d.h - side) / 2, side, side, 0, 0, 480, 480);
      d.done();
      var q = 0.82;
      var url = c.toDataURL('image/jpeg', q);
      while (url.length > 880000 && q > 0.4) { q -= 0.12; url = c.toDataURL('image/jpeg', q); }
      return { url: url, canvas: c };
    });
  }

  function hasFace(canvas) {
    if (!('FaceDetector' in window)) return Promise.resolve(null);
    try {
      return new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }).detect(canvas)
        .then(function (f) { return f.length > 0; }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /* ---------- aparelho ---------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var x = Array.prototype.map.call(b, function (n) { return (n + 256).toString(16).slice(1); }).join('');
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
  }

  function deviceInfo() {
    var id = UI.ls.get('deviceId');
    if (!id) { id = uuid(); UI.ls.set('deviceId', id); }
    var d = { deviceId: id, ua: navigator.userAgent, platform: navigator.platform || '', screen: [screen.width, screen.height],
      dpr: window.devicePixelRatio || 1, touch: navigator.maxTouchPoints || 0, lang: navigator.language || '', tz: '' };
    try { d.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var p;
    try { p = navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion']); } catch (e) { return Promise.resolve(d); }
    return Promise.race([
      Promise.resolve(p).then(function (v) { d.model = v.model || ''; d.platformVersion = v.platformVersion || ''; }),
      new Promise(function (r) { setTimeout(r, 1500); }),
    ]).catch(function () {}).then(function () { return d; });
  }

  /* ================= PASSO 1 ================= */
  function step1(body, ctx) {
    var u = h('input', { type: 'text', maxlength: '24', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', placeholder: 'ex.: pedro.lima', value: S.username });
    var uf = App.field('Usuário', u, { hint: 'É com ele que você entra depois. Letras, números, ponto, traço ou _.' });
    var ok = h('div', { class: 'okline', hidden: true }, 'Livre, pode usar');
    uf.children[2].after(ok);
    var timer;
    function run() {
      var v = clean(u.value);
      return checkUser(v).then(function (d) {
        if (!d || clean(u.value) !== v) return null;
        if (d.ok === null) return d;
        uf.setErr(d.ok ? '' : d.reason);
        ok.hidden = !d.ok;
        return d;
      });
    }
    u.addEventListener('input', function () {
      S.username = u.value;
      ok.hidden = true;
      clearTimeout(timer);
      var v = clean(u.value);
      if (Filter.check(v) || v.length < 3) return;
      timer = setTimeout(run, 450);
    });

    var fn = h('input', { type: 'text', maxlength: '24', autocomplete: 'given-name', autocapitalize: 'words', placeholder: 'ex.: Pedro', value: S.firstName });
    var ff = App.field(['Primeiro nome', h('em', { class: 'req' }, 'obrigatório')], fn, { hint: 'Seu nome de verdade. Só o primeiro.' });
    fn.addEventListener('input', function () { S.firstName = fn.value; });

    var ln = h('input', { type: 'text', maxlength: '24', autocomplete: 'family-name', autocapitalize: 'words', placeholder: 'pode deixar em branco', value: S.lastName });
    var lf = App.field('Sobrenome', ln, { optional: true, hint: 'Não é obrigatório. Se não quiser, deixa em branco.' });
    ln.addEventListener('input', function () { S.lastName = ln.value; });

    var pw = h('input', { type: 'password', maxlength: '100', autocomplete: 'new-password', value: S.password });
    var eye = h('button', { type: 'button', onclick: function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      eye.textContent = show ? 'Ocultar' : 'Mostrar';
    } }, 'Mostrar');
    var pf = App.field('Senha', h('div', { class: 'pw' }, pw, eye), { noFilter: true, hint: 'Qualquer senha serve, não tem mínimo. Ela vai junto na mensagem pro Alisson, então não usa a senha de outra conta.' });
    pw.addEventListener('input', function () { S.password = pw.value; pf.setErr(''); });

    body.append(
      h('div', { class: 'warn big-warn' }, h('b', null, 'Responde sério'), 'Zoeira, palavrão e nome falso são barrados na hora.'),
      uf, ff, lf, pf);
    ctx.fields = { username: uf, firstName: ff, lastName: lf, password: pf };
    ctx.focus = u;

    ctx.validate = function () {
      var bad = [];
      var v = clean(u.value);
      var fnv = clean(fn.value);
      var lnv = clean(ln.value);
      function name(f, val, req, label) {
        if (!val) { if (req) { f.setErr('O primeiro nome é obrigatório.'); bad.push(f); } return; }
        if (Filter.check(val)) { f.setErr('Sem zoeira. Escreva sério.'); bad.push(f); }
        else if (val.length < 2) { f.setErr(label + ' muito curto.'); bad.push(f); }
        else if (!NAME_RE.test(val)) { f.setErr('Use só letras. ' + label + ' sem número ou símbolo.'); bad.push(f); }
        else f.setErr('');
      }
      name(ff, fnv, true, 'Nome');
      name(lf, lnv, false, 'Sobrenome');
      if (!lnv) lf.setErr('');
      if (!pw.value) { pf.setErr('Cria uma senha. Pode ser qualquer uma.'); bad.push(pf); }
      var userBad = '';
      if (v.length < 3) userBad = 'O usuário precisa ter pelo menos 3 caracteres.';
      else if (!USER_RE.test(v)) userBad = 'Use só letras, números, ponto, traço ou _. Sem espaço.';
      else if (Filter.check(v)) userBad = 'Sem zoeira. Escolha um usuário sério.';
      if (userBad) { uf.setErr(userBad); ok.hidden = true; bad.unshift(uf); }
      if (bad.length) { bad[0].scrollIntoView({ block: 'center' }); return false; }
      clearTimeout(timer);
      return run().then(function (d) {
        if (d && d.ok) return true;
        if (d && d.ok === null) { UI.toast(d.reason, true); return false; }
        uf.scrollIntoView({ block: 'center' });
        return false;
      });
    };
  }

  /* ================= PASSO 2 ================= */
  function step2(body, ctx) {
    var prev = h('div', { class: 'photo-prev' });
    var msg = h('div', { class: 'err', hidden: true });
    var note = h('div', { class: 'warn face-note', hidden: true }, h('b', null, 'Não achei um rosto'),
      'Se essa foto não for do seu rosto, o cadastro vai ser recusado. Se for, pode seguir.');
    function setMsg(m) { msg.textContent = m || ''; msg.hidden = !m; }
    function show() {
      prev.className = 'photo-prev' + (S.photo ? ' has' : '');
      prev.replaceChildren(S.photo ? h('img', { src: S.photo, alt: 'Sua foto' }) : h('span', null, 'Sem foto', h('br'), 'ainda'));
      note.hidden = !S.faceWarn;
    }
    function load(file) {
      if (file.type && !/^image\//.test(file.type)) return setMsg('Esse arquivo não é uma foto.');
      setMsg('');
      prev.replaceChildren(h('span', null, 'Preparando...'));
      cropSquare(file).then(function (r) {
        if (r.url.length < 3000) throw new Error('small');
        S.photo = r.url;
        S.faceWarn = false;
        show();
        return hasFace(r.canvas).then(function (found) { if (found === false && S.photo === r.url) { S.faceWarn = true; show(); } });
      }).catch(function () { show(); setMsg('Não deu pra abrir essa imagem. Tenta outra foto (JPG ou PNG).'); });
    }
    function input(capture) {
      var i = h('input', { type: 'file', accept: 'image/*', capture: capture ? 'user' : null, class: 'file-hide', tabindex: '-1', 'aria-hidden': 'true' });
      i.addEventListener('change', function () { var f = i.files && i.files[0]; if (f) load(f); i.value = ''; });
      return i;
    }
    var cam = input(true);
    var gal = input(false);
    show();
    body.append(
      h('div', { class: 'warn' }, h('b', null, 'Obrigatório'),
        'Foto do seu rosto, de frente, com luz, o rosto inteiro aparecendo. Cachorro, meme, desenho, famoso ou outra pessoa: cadastro recusado.'),
      h('div', { class: 'photo-box' },
        prev,
        h('div', { class: 'photo-act' },
          h('button', { class: 'btn block', type: 'button', onclick: function () { cam.click(); } }, 'Tirar foto agora'),
          h('button', { class: 'btn ghost block', type: 'button', onclick: function () { gal.click(); } }, 'Escolher da galeria'),
          h('p', { class: 'hint' }, 'A foto é cortada em quadrado, pelo meio. Deixa o rosto no centro. No computador os dois botões abrem a escolha de arquivo.'),
          msg, note, cam, gal)));
    ctx.fields = { photo: { setErr: setMsg } };
    ctx.validate = function () {
      if (!S.photo) { setMsg('A foto é obrigatória. Tira uma agora ou escolhe da galeria.'); return false; }
      return true;
    };
  }

  /* ================= PASSO 3 ================= */
  function step3(body, ctx) {
    var fichaBox = h('div');
    function drawFicha() {
      fichaBox.replaceChildren(UI.ficha({ firstName: clean(S.firstName), lastName: clean(S.lastName), nickname: S.nickname, bestArt: null }, S.arts));
    }

    var artErr = h('div', { class: 'err', hidden: true });
    function setArtErr(m) { artErr.textContent = m || ''; artErr.hidden = !m; }
    var count = h('span', { class: 'cnt' });
    var tiles = {};
    var artsBox = h('div', { class: 'arts' }, UI.ART_KEYS.map(function (k) {
      tiles[k] = h('button', { type: 'button', class: 'art', onclick: function () {
        var i = S.arts.indexOf(k);
        if (i >= 0) S.arts.splice(i, 1); else S.arts.push(k);
        if (S.arts.length >= 2) setArtErr('');
        drawArts();
      } }, h('img', { src: UI.doll(k), alt: '' }), h('span', null, UI.ART[k]));
      tiles[k].setAttribute('aria-label', UI.ART[k]);
      return tiles[k];
    }));
    function drawArts() {
      UI.ART_KEYS.forEach(function (k) {
        var on = S.arts.indexOf(k) >= 0;
        tiles[k].classList.toggle('on', on);
        tiles[k].setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      count.textContent = S.arts.length + ' de 5, mínimo 2';
      count.classList.toggle('ok', S.arts.length >= 2);
      drawFicha();
    }

    var nickErr = h('div', { class: 'err', hidden: true });
    function setNickErr(m) { nickErr.textContent = m || ''; nickErr.hidden = !m; }
    var q = h('input', { type: 'text', inputmode: 'search', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'Buscar: Bones, Jon Jones, Iron...' });
    var list = h('div', { class: 'nicklist' });
    var now = h('div', { class: 'nick-now' });
    function pickNick(n) { S.nickname = n; setNickErr(''); drawNicks(); drawFicha(); }
    function drawNow() {
      now.replaceChildren(
        h('button', { type: 'button', class: 'toggle' + (S.nickname ? '' : ' on'), onclick: function () { pickNick(''); } }, 'Sem apelido'),
        S.nickname ? h('div', { class: 'nick-sel' }, h('small', null, 'Seu apelido'), h('b', null, '"' + S.nickname + '"')) : h('span', { class: 'mute' }, 'Tudo bem ficar sem. Se quiser um, escolhe na lista.'));
    }
    function drawNicks() {
      var taken = (App.data && App.data.takenNicks) || [];
      if (S.nickname && taken.indexOf(S.nickname) >= 0) {
        setNickErr('Alguém acabou de pegar o apelido "' + S.nickname + '". Escolhe outro.');
        S.nickname = '';
        drawFicha();
      }
      var f = fold(clean(q.value));
      var items = (window.NICKNAMES || []).filter(function (n) { return !f || fold(n[0]).indexOf(f) >= 0 || fold(n[1]).indexOf(f) >= 0; });
      var top = list.scrollTop;
      list.replaceChildren.apply(list, items.length ? items.map(function (n) {
        var gone = taken.indexOf(n[0]) >= 0;
        var on = S.nickname === n[0];
        return h('button', { type: 'button', class: 'nick' + (on ? ' on' : ''), disabled: gone, 'aria-pressed': on ? 'true' : 'false',
          onclick: function () { pickNick(on ? '' : n[0]); } },
          h('b', null, n[0]), h('small', null, n[1], gone ? h('span', { class: 'tk' }, 'escolhido') : null));
      }) : [h('div', { class: 'nick-none' }, 'Nenhum apelido com esse nome.')]);
      list.scrollTop = top;
      drawNow();
    }
    q.addEventListener('input', function () { list.scrollTop = 0; drawNicks(); });

    body.append(
      h('div', { class: 'lbl' }, 'Sua ficha, do jeito que vai aparecer'),
      fichaBox,
      h('h3', { class: 'sub-h' }, 'Artes marciais', count),
      h('p', { class: 'hint top' }, 'Toca nas que você treina ou sabe lutar. Pelo menos 2.'),
      artsBox, artErr,
      h('p', { class: 'hint' }, 'O boneco da ficha não é você que escolhe: o Alisson define quando te avaliar, pela arte em que você for melhor.'),
      h('h3', { class: 'sub-h' }, 'Apelido de lutador', h('em', null, 'opcional')),
      h('p', { class: 'hint top' }, 'Não é obrigatório. São apelidos de lutadores do UFC e cada um só pode ter um dono.'),
      now,
      h('div', { class: 'field nick-q' }, q),
      list, nickErr);
    drawArts();
    drawNicks();
    ctx.onData = drawNicks;
    ctx.fields = { arts: { setErr: setArtErr }, nickname: { setErr: setNickErr } };
    ctx.validate = function () {
      if (S.arts.length < 2) {
        setArtErr(S.arts.length ? 'Marca mais uma. São pelo menos 2 artes marciais.' : 'Marca pelo menos 2 artes marciais.');
        artsBox.scrollIntoView({ block: 'center' });
        return false;
      }
      return true;
    };
  }

  /* ================= PASSO 4 ================= */
  function step4(body, ctx) {
    var c = App.cfg();
    var tot = Number(c.pizzaTotal) || 0;
    var n = Number(c.people) || 0;
    var err = h('div', { class: 'err', hidden: true });
    function setErr(m) { err.textContent = m || ''; err.hidden = !m; }
    var picker = App.foodPicker(S, function () { setErr(''); });
    body.append(
      h('p', { class: 'hint top' }, 'Todo mundo leva alguma coisa, lutador ou plateia. Marca pelo menos 1, pode marcar mais.'),
      picker, err,
      h('h3', { class: 'sub-h' }, 'Pizza: a gente racha'),
      h('div', { class: 'eq sm' },
        h('div', null, h('b', null, tot ? money(tot / 2) : '?'), h('small', null, tot ? 'cada pizza (são 2)' : 'pizza a combinar')),
        h('span', { class: 'op' }, '÷'),
        h('div', null, h('b', null, n || '?'), h('small', null, 'pessoas até agora')),
        h('span', { class: 'op' }, '='),
        h('div', { class: 'res' }, h('b', null, tot && n ? money(tot / n) : '?'), h('small', null, 'cada um'))),
      h('p', { class: 'hint' }, 'O total das 2 pizzas é dividido por todo mundo que vai. O valor por pessoa fecha no dia, conforme quantos forem.'));
    ctx.fields = { food: { setErr: setErr }, foodOther: picker.otherField };
    ctx.validate = function () {
      var e = App.foodError(S);
      if (!e) return true;
      if (/Outros/.test(e) || /zoeira/.test(e)) picker.otherField.setErr(e); else setErr(e);
      return false;
    };
  }

  /* ================= PASSO 5 ================= */
  function step5(body, ctx) {
    function row(label, val, step) {
      return [h('dt', null, label), h('dd', null, val, h('button', { type: 'button', class: 'edit', onclick: function () { S.step = step; draw(); } }, 'alterar'))];
    }
    var food = S.food.map(function (f) { return f === 'Outros' ? 'Outros: ' + clean(S.foodOther) : f; }).join(', ');
    body.append(
      UI.ficha({ firstName: clean(S.firstName), lastName: clean(S.lastName), nickname: S.nickname, bestArt: null }, S.arts),
      h('div', { class: 'confirm' },
        h('img', { class: 'confirm-ph', src: S.photo, alt: 'Sua foto' }),
        h('dl', { class: 'kv' },
          row('Usuário', clean(S.username), 1),
          row('Nome', clean(S.firstName), 1),
          row('Sobrenome', clean(S.lastName) || 'não informado', 1),
          row('Apelido', S.nickname ? '"' + S.nickname + '"' : 'sem apelido', 3),
          row('Artes', S.arts.map(function (a) { return UI.ART[a]; }).join(', '), 3),
          row('Leva', food, 4))),
      h('div', { class: 'warn' }, h('b', null, 'Confere antes'), 'Depois de enviar, só dá pra mudar o que você leva. Você vai receber um código de 6 números pra mandar pro Alisson.'));
    ctx.fields = {};
    ctx.submit = true;
  }

  var VIEWS = [step1, step2, step3, step4, step5];

  /* ---------- envio ---------- */
  function submit(btn) {
    if (S.busy || S.done) return;
    S.busy = true;
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    var mine = S;
    deviceInfo().then(function (device) {
      return UI.api('POST', '/api/register', {
        username: clean(S.username), firstName: clean(S.firstName), lastName: clean(S.lastName), nickname: S.nickname,
        password: S.password, photo: S.photo, arts: S.arts, food: S.food, foodOther: clean(S.foodOther), device: device,
      });
    }).then(function (d) {
      UI.ls.set('tok', d.token);
      UI.ls.set('pw', mine.password);
      App.me = d.me;
      mine.busy = false;
      mine.done = { me: d.me, pw: mine.password };
      if (S === mine && App.cur === ROUTE) drawDone();
      App.refresh(true);
    }).catch(function (e) {
      mine.busy = false;
      var st = FIELD_STEP[e.field];
      if (st) { S.step = st; S.err = { field: e.field, msg: e.message }; draw(); return; }
      btn.disabled = false;
      btn.textContent = 'Enviar cadastro';
      UI.toast(e.message, true);
    });
  }

  function copy(text) {
    function old() {
      var t = h('textarea', { readonly: true, style: { position: 'fixed', top: '0', left: '-9999px' } });
      t.value = text;
      document.body.append(t);
      t.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      t.remove();
      return ok ? Promise.resolve() : Promise.reject(new Error('copy'));
    }
    var p = navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(text).catch(old) : old();
    p.then(function () { UI.toast('Mensagem copiada'); }, function () { UI.toast('Não deu pra copiar. Anota o código e manda pro Alisson.', true); });
  }

  function drawDone() {
    var me = S.done.me;
    var wa = UI.waLink(App.cfg(), me, S.done.pw);
    window.scrollTo(0, 0);
    root.replaceChildren(
      h('header', { class: 'ph' },
        h('p', { class: 'kicker' }, UI.tag('Cadastro enviado'), ' falta só uma coisa'),
        h('h1', { class: 'page-title' }, 'Manda o código'),
        h('p', { class: 'page-sub' }, 'O Alisson só aprova quem mandar o código no WhatsApp. Sem isso você não entra no campeonato.')),
      h('div', { class: 'sent' },
        h('div', { class: 'done-code' },
          h('div', { class: 'lbl' }, 'Seu código'),
          h('div', { class: 'code' }, me.code)),
        h('div', { class: 'done-how' },
          h('ol', { class: 'regs' },
            h('li', null, h('b', null, 'Toca em "Mandar pro Alisson".'), ' A mensagem já vai pronta, com usuário, código e senha.'),
            h('li', null, h('b', null, 'Manda do jeito que tá.'), ' Não precisa mudar nada.'),
            h('li', null, h('b', null, 'Espera ele aprovar.'), ' Dá pra acompanhar em Meu perfil.')),
          wa.hasNumber ? null : h('div', { class: 'warn' }, h('b', null, 'Sem número'), 'O número do Alisson ainda não tá no site. O WhatsApp vai abrir pra você escolher o contato dele.'),
          h('div', { class: 'done-acts' },
            h('a', { class: 'btn wa big block', href: wa.url, target: '_blank', rel: 'noopener' }, 'Mandar pro Alisson no WhatsApp'),
            h('button', { class: 'btn ghost block done-copy', type: 'button', onclick: function () { copy(wa.text); } }, 'Copiar mensagem')),
          h('p', { class: 'hint' }, 'Se o WhatsApp não abrir, copia a mensagem e cola na conversa com o Alisson.'),
          h('div', { class: 'row done-foot' }, h('a', { class: 'lnk', href: '#/perfil' }, 'Ir pro meu perfil')))));
  }

  /* ---------- montagem ---------- */
  function draw() {
    var step = S.step;
    var ctx = {};
    var body = h('div', { class: 'step-body' });
    VIEWS[step - 1](body, ctx);
    live = ctx;
    var nextBtn = h('button', { class: 'btn' + (ctx.submit ? ' big' : ''), type: 'button' }, ctx.submit ? 'Enviar cadastro' : 'Continuar');
    nextBtn.addEventListener('click', function () {
      if (ctx.submit) return submit(nextBtn);
      if (S.busy) return;
      S.busy = true;
      nextBtn.disabled = true;
      Promise.resolve(ctx.validate()).catch(function () { return false; }).then(function (ok) {
        S.busy = false;
        nextBtn.disabled = false;
        if (!ok || live !== ctx) return;
        S.step++;
        draw();
        window.scrollTo(0, 0);
      });
    });
    var back = step > 1
      ? h('button', { class: 'btn ghost', type: 'button', onclick: function () { if (S.busy) return; S.step--; draw(); window.scrollTo(0, 0); } }, 'Voltar')
      : h('span');
    root.replaceChildren(
      h('div', { class: 'wizard' },
        h('aside', { class: 'wz-side' },
          h('h1', { class: 'wz-title' }, 'Cadastro'),
          h('p', { class: 'wz-sub' }, 'Leva uns 3 minutos. Já se cadastrou? ', h('a', { class: 'lnk', href: '#/entrar' }, 'Entrar')),
          h('div', { class: 'wz-step', 'aria-live': 'polite' },
            h('span', { class: 'wz-n' }, String(step).padStart(2, '0')),
            h('span', { class: 'wz-of' }, '/' + String(STEPS.length).padStart(2, '0')),
            h('h2', { class: 'step-title' }, STEPS[step - 1])),
          h('ol', { class: 'prog', 'aria-label': 'Passo ' + step + ' de ' + STEPS.length },
            STEPS.map(function (s, i) { return h('li', { class: i < step - 1 ? 'on' : i === step - 1 ? 'on now' : '' }, s); }))),
        h('div', { class: 'wz-main' },
          body,
          h('div', { class: 'nav-btns' }, back, nextBtn))));
    if (S.err) {
      var f = ctx.fields && ctx.fields[S.err.field];
      if (f) {
        f.setErr(S.err.msg);
        if (f.scrollIntoView) setTimeout(function () { f.scrollIntoView({ block: 'center' }); }, 0);
      } else UI.toast(S.err.msg, true);
      S.err = null;
    }
  }

  var ROUTE = {
    title: 'Cadastro',
    render: function (el) {
      if (App.loggedIn()) return App.go('#/perfil');
      if (!S || S.done) S = fresh();
      S.busy = false;
      root = el;
      draw();
    },
    onData: function () {
      if (S && !S.done && live && live.onData) live.onData();
    },
  };
  App.route('#/cadastro', ROUTE);
})();
