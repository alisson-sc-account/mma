/* Descobre qual aparelho esta cadastrando, a partir do que o navegador informa. */

// iPhones se distinguem pela tela (largura x altura em px CSS, com a escala). Valores aproximados.
const IPHONES = {
  '320x568@2': 'iPhone SE 1 / 5s',
  '375x667@2': 'iPhone 6 / 7 / 8 / SE 2 / SE 3',
  '414x736@3': 'iPhone 6 / 7 / 8 Plus',
  '375x812@3': 'iPhone X / XS / 11 Pro / 12 mini / 13 mini',
  '414x896@2': 'iPhone XR / 11',
  '414x896@3': 'iPhone XS Max / 11 Pro Max',
  '390x844@3': 'iPhone 12 / 12 Pro / 13 / 13 Pro / 14',
  '428x926@3': 'iPhone 12 Pro Max / 13 Pro Max / 14 Plus',
  '393x852@3': 'iPhone 14 Pro / 15 / 15 Pro / 16',
  '430x932@3': 'iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus',
  '402x874@3': 'iPhone 16 Pro',
  '440x956@3': 'iPhone 17 Pro Max / 16 Pro Max',
};

function browserOf(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/FxiOS|Firefox/.test(ua)) return 'Firefox';
  if (/CriOS|Chrome/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  return 'Navegador';
}

function describe(device, ip) {
  const d = device || {};
  const ua = String(d.ua || '');
  const screen = Array.isArray(d.screen) ? d.screen.map(Number) : [0, 0];
  const w = Math.min(screen[0] || 0, screen[1] || 0);
  const h = Math.max(screen[0] || 0, screen[1] || 0);
  const dpr = Math.round((Number(d.dpr) || 1) * 100) / 100;
  const browser = browserOf(ua);
  const size = w && h ? `${w}x${h} @${dpr}x` : '';
  let label = 'Aparelho desconhecido';
  let os = '';

  if (/iPhone/.test(ua)) {
    const m = ua.match(/OS (\d+)[_.](\d+)/);
    os = m ? `iOS ${m[1]}.${m[2]}` : 'iOS';
    label = IPHONES[`${w}x${h}@${Math.round(dpr)}`] || 'iPhone (modelo nao identificado)';
  } else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && Number(d.touch) > 1)) {
    label = 'iPad';
    os = 'iPadOS';
  } else if (/Android/.test(ua)) {
    const v = ua.match(/Android (\d+(?:\.\d+)?)/);
    os = v ? `Android ${v[1]}` : 'Android';
    let model = d.model && d.model !== 'K' ? String(d.model).trim() : '';
    if (!model) {
      const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\)|;)/);
      if (m && m[1] !== 'K') model = m[1].trim();
    }
    label = model ? `Android ${model}` : 'Android (modelo oculto pelo navegador)';
  } else if (/Windows/.test(ua)) {
    label = 'Computador Windows';
    os = 'Windows';
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    label = 'Mac';
    os = 'macOS';
  } else if (/Linux|X11/.test(ua)) {
    label = 'Computador Linux';
    os = 'Linux';
  }

  const detail = [os, browser, size, d.lang, ip ? `IP ${ip}` : ''].filter(Boolean).join(' · ');
  return { label, detail };
}

module.exports = { describe };
