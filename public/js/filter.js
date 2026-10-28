/* Detector de zoeira. Usado no navegador (Filter) e no servidor (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Filter = factory();
})(this, function () {
  var LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

  // Palavras que so contam quando aparecem inteiras (evita bloquear "Rolando", "Paulo", "Cubas"...)
  var WHOLE = [
    'pinto', 'pintao', 'pintinho', 'rola', 'rolao', 'pau', 'paudecego', 'cu', 'cuzao', 'cuzinho', 'xota', 'xana', 'piru', 'pica',
    'bct', 'krl', 'fdp', 'vsf', 'vtnc', 'tnc', 'pqp', 'puta', 'putinha', 'puto', 'merda', 'bosta', 'otario', 'imbecil', 'idiota',
    'viado', 'veado', 'viadinho', 'bicha', 'gay', 'bunda', 'bundao', 'penis', 'vagina', 'sexo', 'porno', 'porn', 'hentai',
    'gozar', 'gozada', 'punheta', 'nazi', 'nazista', 'heil', 'kkk', 'hitler', 'nigga', 'nigger', 'faggot', '1488', 'whitepower'
  ];

  // Palavras longas e inequivocas: bloqueadas mesmo coladas em outras
  var SUBSTR = [
    'hitler', 'nazista', 'nazismo', 'suastica', 'swastika', 'siegheil', 'heilhitler', 'buceta', 'punheta', 'caralho', 'piroca',
    'xereca', 'xoxota', 'estupr', 'pedofil', 'prostitu', 'arrombado', 'nigger', 'faggot', 'crioulo', 'whitepower', 'cuzao'
  ];

  function collapse(s) { return s.replace(/(.)\1+/g, '$1'); }
  function strip(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  var wholeSet = {};
  WHOLE.forEach(function (w) { wholeSet[collapse(w)] = w; });
  var substr = SUBSTR.map(function (w) { return { raw: w, key: collapse(w) }; });

  function tokens(s) { return s.split(/[^a-z0-9]+/).filter(Boolean); }

  /** Retorna a palavra barrada, ou null se o texto esta limpo. */
  function check(text) {
    if (text == null) return null;
    var base = strip(text);
    if (!base.trim()) return null;
    var leeted = base.replace(/[013457@$!]/g, function (c) { return LEET[c]; });

    var candidates = tokens(leeted);
    tokens(base).forEach(function (t) {
      var noDigits = t.replace(/[0-9]/g, '');
      if (noDigits && noDigits !== t) candidates.push(noDigits);
    });

    // "p i n t o" -> sequencias de letras soltas viram uma palavra
    var run = '';
    leeted.split(/\s+/).forEach(function (part) {
      if (part.length === 1) run += part;
      else { if (run.length >= 2) candidates.push(run); run = ''; }
    });
    if (run.length >= 2) candidates.push(run);

    for (var i = 0; i < candidates.length; i++) {
      var hit = wholeSet[collapse(candidates[i])];
      if (hit) return hit;
    }

    var compact = collapse(leeted.replace(/[^a-z0-9]+/g, ''));
    for (var j = 0; j < substr.length; j++) {
      if (compact.indexOf(substr[j].key) !== -1) return substr[j].raw;
    }
    return null;
  }

  /** Confere varios campos; devolve {field, word} do primeiro barrado. */
  function checkAll(obj) {
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var w = check(obj[k]);
      if (w) return { field: k, word: w };
    }
    return null;
  }

  return { check: check, checkAll: checkAll };
});
