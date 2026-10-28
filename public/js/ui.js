/* Utilidades de interface. Tudo monta DOM com h(): texto de usuario nunca vira HTML. */
(function () {
  var ART = { jiujitsu: 'Jiu-jitsu', boxe: 'Boxe', kickboxing: 'Kickboxing', muaythai: 'Muay thai', capoeira: 'Capoeira' };
  var ART_KEYS = ['jiujitsu', 'boxe', 'kickboxing', 'muaythai', 'capoeira'];

  function h(tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    var kids = Array.prototype.slice.call(arguments, 2);
    (function add(list) {
      list.forEach(function (c) {
        if (Array.isArray(c)) return add(c);
        if (c == null || c === false) return;
        el.append(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return el;
  }

  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  function api(method, url, body, kind) {
    var headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var tok = ls.get(kind === 'admin' ? 'adm' : 'tok');
    if (tok) headers.Authorization = 'Bearer ' + tok;
    return fetch(url, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined })
      .catch(function () { throw new Error('Sem conexão com o servidor. Tente de novo.'); })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) { var e = new Error(data.error || 'Algo deu errado.'); e.status = res.status; e.field = data.field; throw e; }
          return data;
        });
      });
  }

  var tt;
  function toast(msg, bad) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'on' + (bad ? ' bad' : '');
    clearTimeout(tt);
    tt = setTimeout(function () { el.className = ''; }, bad ? 4200 : 2600);
  }

  function overlay(content) {
    var o = document.getElementById('overlay');
    o.replaceChildren(content);
    o.className = 'on';
    return function close() { o.className = ''; o.replaceChildren(); };
  }

  var doll = function (art) { return 'img/' + (art || 'boxe') + '.jpg'; };
  var photo = function (p) { return '/api/photo/' + p.id + '?v=' + (p.photoV || 1); };
  var full = function (p) { return p.firstName + (p.lastName ? ' ' + p.lastName : ''); };

  /* Mesma formula do servidor, so para previa no painel do admin. */
  function rating(scores, strength, weight, height) {
    var cl = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
    var v = Object.keys(scores || {}).map(function (k) { return Number(scores[k]); }).filter(function (n) { return n > 0; });
    var best = v.length ? Math.max.apply(null, v) : 1;
    var avg = v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : 1;
    var skill = (0.6 * best + 0.4 * avg) / 10;
    var str = cl((Number(strength) || 1) / 15, 0, 1);
    var size = 0.7 * cl(((Number(weight) || 60) - 45) / 65, 0, 1) + 0.3 * cl(((Number(height) || 165) - 150) / 45, 0, 1);
    return Math.round(1000 * (0.55 * skill + 0.25 * str + 0.2 * size)) / 10;
  }

  /* Etiqueta cortada em angulo, como nos graficos de luta. */
  function tag(text, kind) { return h('span', { class: 'tag' + (kind ? ' ' + kind : '') }, text); }

  /* Ficha em formato de cartaz: nome grande por cima do boneco.
     O boneco so aparece depois que o Alisson define (bestArt vem do servidor). */
  function ficha(p, arts) {
    var best = p.bestArt;
    var list = (arts || p.arts || []).map(function (a) { return ART[a]; }).filter(Boolean);
    return h('div', { class: 'ficha' + (best ? '' : ' nodoll') },
      best ? h('div', { class: 'ficha-doll' }, h('img', { src: doll(best), alt: 'Boneco de ' + ART[best] })) : null,
      h('div', { class: 'nm' },
        list.length ? h('span', { class: 'ficha-k' }, list.join(' / ')) : null,
        h('b', { class: 'fn' }, p.firstName || 'Seu nome'),
        p.nickname ? h('i', null, '"' + p.nickname + '"') : null,
        p.lastName ? h('b', { class: 'ln' }, p.lastName) : null,
        h('small', null, best ? 'Boneco: ' + ART[best] : 'Sem boneco ainda. Quem escolhe é o Alisson, quando aprovar.')));
  }

  /* Linha de lutador no estilo "line-up" de cartaz. */
  function tile(p, opts) {
    var o = opts || {};
    var arts = (p.arts || []).map(function (a) { return ART[a]; }).join(' / ');
    return h('article', { class: 'fr' + (o.me ? ' me' : '') },
      h('div', { class: 'fr-doll' }, h('img', { src: doll(p.bestArt), alt: '', loading: 'lazy' })),
      h('div', { class: 'fr-txt' },
        h('div', { class: 'fr-top' },
          h('img', { class: 'fr-face', src: photo(p), alt: full(p), loading: 'lazy' }),
          o.no ? h('span', { class: 'fr-no' }, String(o.no).padStart(2, '0')) : null,
          o.me ? tag('Você', 'ink') : null),
        h('b', { class: 'fr-fn' }, p.firstName),
        p.nickname ? h('i', { class: 'fr-nk' }, '"' + p.nickname + '"') : null,
        p.lastName ? h('b', { class: 'fr-ln' }, p.lastName) : null,
        h('div', { class: 'fr-meta' }, o.rec ? h('strong', null, o.rec) : null, arts)));
  }

  /* Linha curta (plateia): rosto, nome e boneco pequeno. */
  function person(p, opts) {
    var o = opts || {};
    return h('div', { class: 'pr' + (o.me ? ' me' : '') },
      h('img', { class: 'pr-face', src: photo(p), alt: '', loading: 'lazy' }),
      h('div', { class: 'pr-n' }, h('b', null, full(p)), p.nickname ? h('i', null, '"' + p.nickname + '"') : null,
        o.line ? h('small', null, o.line) : null),
      o.me ? tag('Você', 'ink') : null,
      p.bestArt ? h('img', { class: 'pr-doll', src: doll(p.bestArt), alt: '', loading: 'lazy' }) : null);
  }

  function waLink(config, me, password) {
    var msg = 'Octógono Sexta - cadastro\nUsuário: ' + me.username + '\nCódigo: ' + me.code + '\nSenha: ' + (password || '(esqueci de anotar)');
    var n = (config && config.whatsapp) || '';
    return { text: msg, url: 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg), hasNumber: !!n };
  }

  window.UI = { h: h, ls: ls, api: api, toast: toast, overlay: overlay, ART: ART, ART_KEYS: ART_KEYS, doll: doll, photo: photo, full: full, rating: rating, ficha: ficha, tile: tile, person: person, tag: tag, waLink: waLink };
})();
