(function () {
  const { patterns, font } = window.SNIFFER;
  const { computeLayout, pieceMatrix, captionMatrix, fitCaption, textCommands } = Layout;
  const grids = Object.fromEntries(patterns.map(t => [t.id, Pdf.gridFromSvg(t.svg)]));
  const inner = Object.fromEntries(patterns.map(t => [t.id, t.svg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')]));
  // Straight-edge variant: same art plus the filled gaps, for both the preview and the PDF.
  const solid = Object.fromEntries(patterns.map(t => {
    const grid = Pdf.fillGaps(grids[t.id]);
    const extra = grid.flatMap((row, y) => row.flatMap((c, x) => grids[t.id][y][x] ? [] : [`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`]));
    return [t.id, { grid, svg: inner[t.id] + extra.join('') }];
  }));
  const FORMATS = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
  const MAX_PAGE = 5080; // PDF 1.4 page limit, 200 inches

  const $ = id => document.getElementById(id);
  const parse = el => {
    const s = el.value.trim().replace(',', '.');
    return /^\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN;
  };
  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
  };
  const fmt = n => String(n).replace('.', ',');
  const MAX_COPIES = 20;
  const assign = {}; // manual mode: instance -> sheet number

  function readSettings() {
    const pixel = parse($('pixel')), margin = parse($('margin')), format = $('format').value;
    if (!(pixel > 0)) return { error: 'Размер пикселя должен быть положительным числом, например 10 или 7,5.' };
    if (!(margin >= 0)) return { error: 'Поля должны быть числом не меньше нуля.' };
    let pageW, pageH, label = format;
    if (format === 'custom') {
      pageW = parse($('customW')); pageH = parse($('customH'));
      if (!(pageW > 0 && pageH > 0)) return { error: 'Укажите ширину и высоту листа положительными числами.' };
      if (pageW > MAX_PAGE || pageH > MAX_PAGE) return { error: `Сторона листа не может быть больше ${MAX_PAGE} мм.` };
      label = `${pageW}x${pageH}mm`;
    } else [pageW, pageH] = FORMATS[format];
    const parts = [];
    for (const t of patterns) {
      const v = $('copies-' + t.id).value.trim();
      if (!/^\d+$/.test(v) || +v > MAX_COPIES) return { error: `Число копий должно быть целым, от 0 до ${MAX_COPIES}.` };
      parts.push({ ...t, copies: +v });
    }
    if (!parts.some(t => t.copies)) return { error: 'Укажите хотя бы одну копию.' };
    const ragged = $('ragged').checked;
    return {
      pixel, margin, pageW, pageH, label, parts, mode: $('mode').value,
      grids: ragged ? grids : Object.fromEntries(patterns.map(t => [t.id, solid[t.id].grid])),
      art: ragged ? inner : Object.fromEntries(patterns.map(t => [t.id, solid[t.id].svg])),
    };
  }

  // Smallest standard format that holds every part whole.
  const largeEnough = s => Object.keys(FORMATS).find(name => {
    const [pageW, pageH] = FORMATS[name];
    return Layout.maxPixel({ patterns: s.parts.filter(t => t.copies), pageW, pageH, margin: s.margin }) >= s.pixel;
  });

  const instances = parts => parts.flatMap(t => Array.from({ length: t.copies }, (_, k) => ({
    key: `${t.id}-${k + 1}`, label: t.copies > 1 ? `${t.name} ${k + 1}` : t.name,
  })));

  // Manual mode starts from the automatic layout, so the user only moves what they want to change.
  function renderManual() {
    const box = $('manual');
    box.hidden = $('mode').value !== 'manual';
    if (box.hidden) return;
    const s = readSettings();
    if (s.error) return;
    const auto = computeLayout({ patterns: s.parts, pixel: s.pixel, pageW: s.pageW, pageH: s.pageH, margin: s.margin, mode: 'separate' });
    const list = instances(s.parts);
    box.replaceChildren(...list.map(({ key, label }) => {
      assign[key] ??= auto.placement?.[key] ?? 1;
      const row = document.createElement('label');
      row.textContent = label;
      const select = document.createElement('select');
      select.id = 'page-' + key;
      for (let i = 1; i <= list.length; i++) select.add(new Option(`Лист ${i}`, i));
      select.value = Math.min(assign[key], list.length);
      select.addEventListener('change', () => { assign[key] = +select.value; render(); });
      row.append(select);
      return row;
    }));
  }

  const fileName = (i, n, s, copies) => `sniffer-${i + 1}-iz-${n}-${s.label}-${s.pixel}mm${copies > 1 ? `-x${copies}` : ''}.pdf`;
  const pdfBytes = (sheet, i, n, s) => Pdf.buildPdf(
    Pdf.sheetContent(sheet, { pixel: s.pixel, pageW: s.pageW, pageH: s.pageH, margin: s.margin, grids: s.grids, font }),
    s.pageW, s.pageH, `Sniffer ${i + 1}/${n}`);

  function save(bytes, name, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type }));
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  const pathD = cmds => cmds.map(c => c[0] + c.slice(1).map(v => +v.toFixed(3)).join(' ')).join('');

  function sheetSvg(sheet, s, index) {
    const parts = sheet.pieces.map(pc => {
      const cap = fitCaption(pc, s.pixel, font);
      const text = cap ? `<path transform="matrix(${captionMatrix(pc, s.pixel).join(' ')})" fill="#595959" d="${pathD(textCommands(cap.text, cap.size, 0, -1, font))}"/>` : '';
      return `<g transform="matrix(${pieceMatrix(pc, s.pixel).join(' ')})"><svg x="0" y="0" width="${pc.sw}" height="${pc.sh}" viewBox="0 0 ${pc.sw} ${pc.sh}" shape-rendering="crispEdges">${s.art[pc.id]}</svg></g>${text}`;
    });
    const clip = sheet.cropped ? `<clipPath id="clip${index}"><rect x="${s.margin}" y="${s.margin}" width="${s.pageW - 2 * s.margin}" height="${s.pageH - 2 * s.margin}"/></clipPath>` : '';
    return `<svg class="sheet" viewBox="0 0 ${s.pageW} ${s.pageH}" role="img" aria-label="Предпросмотр листа"><rect width="${s.pageW}" height="${s.pageH}" fill="#fff"/>${clip}<g${sheet.cropped ? ` clip-path="url(#clip${index})"` : ''}>${parts.join('')}</g></svg>`;
  }

  let current = null;

  function render() {
    const s = readSettings();
    const status = $('status'), sheets = $('sheets'), all = $('downloadAll');
    current = null;
    sheets.replaceChildren();
    all.hidden = true;
    status.className = 'status';
    if (s.error) { status.classList.add('bad'); status.textContent = s.error; return; }

    const r = computeLayout({ patterns: s.parts, pixel: s.pixel, pageW: s.pageW, pageH: s.pageH, margin: s.margin, mode: s.mode, assign });
    if (r.error) {
      status.classList.add('bad');
      status.textContent = 'Поля слишком большие: на листе не остаётся места для печати.';
      return;
    }

    const n = r.sheets.length;
    current = { r, s };
    const lines = [];
    const head = document.createElement('p');
    head.className = 'count';
    head.textContent = n === 1 ? '1 файл PDF, один лист' : `${n} ${plural(n, 'файл', 'файла', 'файлов')} PDF, в каждом один лист`;
    lines.push(head);
    const add = text => { const p = document.createElement('p'); p.textContent = text; lines.push(p); };
    const printed = r.sheets.reduce((sum, sh) => sum + sh.copies, 0);
    const times = c => `${c} ${plural(c, 'раз', 'раза', 'раз')}`;
    const repeats = r.sheets.map((sh, i) => ({ i, copies: sh.copies })).filter(x => x.copies > 1);
    add(`Всего к печати: ${printed} ${plural(printed, 'лист', 'листа', 'листов')}.` +
      (repeats.length ? ` Повторить: ${repeats.map(x => `файл №${x.i + 1}: ${times(x.copies)}`).join(', ')}.` : ''));
    if (r.omitted.length) {
      status.classList.add('bad');
      add(`Не поместилось и в файл не вошло: ${r.omitted.map(o => `${o.name} (лист ${o.page})`).join(', ')}. Перенесите эти части на другой лист.`);
    }
    if (r.oversize.length) {
      const name = largeEnough(s);
      const max = Math.floor(Layout.maxPixel({ patterns: s.parts.filter(t => t.copies), pageW: s.pageW, pageH: s.pageH, margin: s.margin }) * 10) / 10;
      status.classList.add('bad');
      add(`Размер пикселя слишком большой: на лист не помещается: ${r.oversize.join(', ')}. Изображение обрезано по краю листа, скачать его всё равно можно.`);
      add(`Чтобы всё поместилось, уменьшите пиксель до ${fmt(max)} мм${name ? ` или выберите формат ${name.replace('A', 'А')}` : ''}.`);
    } else if (!r.omitted.length) {
      add(s.mode === 'manual' ? 'Все части целые.' : r.minimal ? 'Все части целые, число листов минимально.' : 'Все части целые. Это лучший найденный вариант, меньшее число листов не исключено.');
    }
    status.replaceChildren(...lines);

    r.sheets.forEach((sheet, i) => {
      const card = document.createElement('figure');
      card.className = 'card';
      card.innerHTML = sheetSvg(sheet, s, i);
      const cap = document.createElement('figcaption');
      const label = document.createElement('span');
      label.textContent = `Файл ${i + 1} из ${n}` + (sheet.page ? ` (лист ${sheet.page})` : '') + (sheet.copies > 1 ? `, печатать ${times(sheet.copies)}` : '');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Скачать PDF';
      btn.addEventListener('click', () => save(pdfBytes(sheet, i, n, s), fileName(i, n, s, sheet.copies), 'application/pdf'));
      if (sheet.cropped) {
        const tag = document.createElement('strong');
        tag.textContent = 'Не помещается, обрезано';
        label.append(document.createElement('br'), tag);
      }
      cap.append(label, btn);
      card.append(cap);
      sheets.append(card);
    });
    all.hidden = n < 2;
  }

  $('downloadAll').addEventListener('click', () => {
    if (!current) return;
    const { r, s } = current, n = r.sheets.length;
    const files = r.sheets.map((sheet, i) => ({ name: fileName(i, n, s, sheet.copies), bytes: pdfBytes(sheet, i, n, s) }));
    save(Pdf.makeZip(files), `sniffer-${s.label}-${s.pixel}mm.zip`, 'application/zip');
  });

  const refresh = () => { renderManual(); render(); };
  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 200); };
  $('copies').append(...patterns.map(t => {
    const row = document.createElement('label');
    row.textContent = t.name;
    const input = document.createElement('input');
    Object.assign(input, { id: 'copies-' + t.id, type: 'text', inputMode: 'numeric', value: t.copies, autocomplete: 'off' });
    input.addEventListener('input', schedule);
    row.append(input);
    return row;
  }));
  for (const id of ['pixel', 'margin', 'customW', 'customH']) $(id).addEventListener('input', schedule);
  $('ragged').addEventListener('change', render);
  $('mode').addEventListener('change', refresh);
  $('format').addEventListener('change', () => { $('custom').hidden = $('format').value !== 'custom'; refresh(); });
  render();
})();
