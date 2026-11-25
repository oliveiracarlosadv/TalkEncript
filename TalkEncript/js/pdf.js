// Geração do PDF do relatório (A4), no formato de relatório técnico de preservação de prova
// digital: capa, cabeçalho com o símbolo do sistema e rodapé com o identificador, o código de
// verificação e a paginação. Fonte Arial (Liberation Sans, licença SIL OFL 1.1, com as mesmas
// métricas da Arial). Prints largos são reproduzidos em página deitada (paisagem).

import { justifyText } from './justify.js';
import { VERDE } from './cabecalho.js';
import { APP } from './report.js';
import qrcode from '../vendor/qrcode-generator.esm.js';

const ESCURO = [55, 55, 55];
const CINZA = [110, 110, 110];
const CLARO = [150, 150, 150];
const TINTA = [232, 236, 222];
const LINHA = [200, 204, 196];
const PRETO = [0, 0, 0];
const MARGEM = 20;
const TOPO = 32;
const RODAPE = 22;
const pt = (size) => size * 0.3528;

/** Converte ArrayBuffer em base64 (formato exigido pelo jsPDF para fontes). */
export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}

/** Matriz de módulos do QR code (true = escuro). */
export function qrMatrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (__, c) => qr.isDark(r, c)));
}

/**
 * @param jsPDF classe do jsPDF
 * @param blocks blocos de `buildBlocks`
 * @param meta { id, verificationCode, operador, simbolo (PNG colorido em base64, opcional) }
 * @param fonts { regular, bold } em base64
 */
export function renderPDF(jsPDF, blocks, meta, fonts) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Arial-Regular.ttf', fonts.regular);
  doc.addFont('Arial-Regular.ttf', 'Arial', 'normal');
  doc.addFileToVFS('Arial-Bold.ttf', fonts.bold);
  doc.addFont('Arial-Bold.ttf', 'Arial', 'bold');
  doc.setProperties({
    title: `Relatório ${meta.id}`,
    subject: 'Relatório de integridade de conversa eletrônica exportada (hash e cadeia de custódia)',
    author: meta.operador,
    creator: `${APP.rotulo}, ${APP.edicao} (${APP.criador.nome}, ${APP.criador.oab})`,
    keywords: `hash, SHA-256, SHA-512, SHA3-512, cadeia de custódia, ${meta.id}`,
  });

  const W = () => doc.internal.pageSize.getWidth();
  const H = () => doc.internal.pageSize.getHeight();
  const left = MARGEM;
  const width = () => W() - 2 * MARGEM;
  const bottom = () => H() - RODAPE;
  let size = 10;
  let lh = pt(size) * 1.35;
  let y = TOPO;
  const capas = new Set();

  const font = (style = 'normal', s = size, color = ESCURO) => {
    size = s;
    lh = pt(s) * 1.35;
    doc.setFont('Arial', style);
    doc.setFontSize(s);
    doc.setTextColor(...color);
  };
  const newPage = (orientation = 'portrait') => { doc.addPage('a4', orientation); y = TOPO; };
  const ensure = (h) => { if (y + h > bottom()) newPage(); };
  const splitChars = (text, maxWidth) => {
    const lines = [];
    let current = '';
    for (const ch of String(text)) {
      if (doc.getTextWidth(current + ch) > maxWidth && current) { lines.push(current); current = ch; } else current += ch;
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  };
  const wrap = (text, maxWidth) => doc.splitTextToSize(String(text ?? ''), maxWidth)
    .flatMap((l) => (doc.getTextWidth(l) > maxWidth ? splitChars(l, maxWidth) : [l]));
  const writeLines = (lines, x, maxWidth, { justify = true } = {}) => {
    lines.forEach((line, i) => {
      ensure(lh);
      if (justify) justifyText(doc, line, x, y + lh * 0.75, maxWidth, i === lines.length - 1);
      else doc.text(line, x, y + lh * 0.75);
      y += lh;
    });
  };

  // Texto com trechos em negrito, quebrado e justificado como o texto comum.
  const pieceWidth = (pc) => { doc.setFont('Arial', pc.bold ? 'bold' : 'normal'); return doc.getTextWidth(pc.text); };
  const wordWidth = (w) => w.reduce((t, pc) => t + pieceWidth(pc), 0);
  const richWrap = (segments, maxWidth) => {
    const words = [];
    let word = [];
    const push = (text, bold) => {
      const last = word[word.length - 1];
      if (last && last.bold === bold) last.text += text; else word.push({ text, bold });
    };
    for (const sg of segments) {
      for (const ch of sg.text) {
        if (/\s/.test(ch)) { if (word.length) { words.push(word); word = []; } } else push(ch, !!sg.bold);
      }
    }
    if (word.length) words.push(word);
    const fitted = words.flatMap((w) => {
      if (wordWidth(w) <= maxWidth) return [w];
      const parts = [];
      let cur = [];
      for (const pc of w) {
        for (const ch of pc.text) {
          const trial = [...cur.map((x) => ({ ...x })), { text: ch, bold: pc.bold }];
          if (cur.length && wordWidth(trial) > maxWidth) { parts.push(cur); cur = []; }
          const last = cur[cur.length - 1];
          if (last && last.bold === pc.bold) last.text += ch; else cur.push({ text: ch, bold: pc.bold });
        }
      }
      if (cur.length) parts.push(cur);
      return parts;
    });
    doc.setFont('Arial', 'normal');
    const space = doc.getTextWidth(' ');
    const lines = [];
    let line = [];
    let used = 0;
    for (const w of fitted) {
      const ww = wordWidth(w);
      if (line.length && used + space + ww > maxWidth) { lines.push(line); line = []; used = 0; }
      used += (line.length ? space : 0) + ww;
      line.push(w);
    }
    if (line.length) lines.push(line);
    return lines.length ? lines : [[]];
  };
  const drawRich = (line, x, maxWidth, last) => {
    doc.setFont('Arial', 'normal');
    const space = doc.getTextWidth(' ');
    const used = line.reduce((t, w) => t + wordWidth(w), 0);
    const gap = !last && line.length > 1 ? (maxWidth - used) / (line.length - 1) : space;
    let cx = x;
    line.forEach((w, k) => {
      for (const pc of w) {
        doc.setFont('Arial', pc.bold ? 'bold' : 'normal');
        doc.text(pc.text, cx, y + lh * 0.75);
        cx += doc.getTextWidth(pc.text);
      }
      cx += k < line.length - 1 ? gap : 0;
    });
    doc.setFont('Arial', 'normal');
  };

  // Linhas "HASH SHA-256: ..." em letra pequena, quebradas entre caracteres.
  const hashBlockLines = (hashes, maxWidth, s = 6.5) => {
    font('normal', s, CINZA);
    return hashes.flatMap(([alg, h]) => splitChars(`HASH ${alg}: ${h}`, maxWidth));
  };
  const drawHashes = (hashes, x, maxWidth, s = 6.5) => {
    const lines = hashBlockLines(hashes, maxWidth, s);
    for (const l of lines) { ensure(lh); doc.text(l, x, y + lh * 0.75); y += lh; }
  };

  const faixaRotulo = (label, x = left, w = width(), s = 10.5) => {
    const h = pt(s) * 1.9;
    doc.setFillColor(...TINTA);
    doc.rect(x, y, w, h, 'F');
    font('normal', s, VERDE);
    doc.text(label, x + 2, y + h * 0.68);
    y += h + 1.6;
  };

  // -------------------------------------------------------------------------
  // Capa
  const drawCover = (bl) => {
    capas.add(doc.getCurrentPageInfo().pageNumber);
    const w = width();
    let top = 22;
    if (meta.simbolo) doc.addImage(meta.simbolo, 'PNG', left, top, 42, 42 * (94 / 307), 'simbolo-cor');
    font('bold', 24, VERDE);
    doc.text('TalkEncript', left + 46, top + 10);
    font('normal', 10.5, VERDE);
    doc.text(['Integridade e preservação', 'de provas digitais'], left + w, top + 5, { align: 'right' });
    top = 72;
    doc.setFillColor(...VERDE);
    doc.rect(left, top, w, 12, 'F');
    font('bold', 16, [255, 255, 255]);
    doc.text(bl.faixa, left + 5, top + 8.4);
    top += 30;
    font('bold', 31, VERDE);
    bl.titulo.forEach((t, i) => doc.text(t, left, top + i * 13));
    top += bl.titulo.length * 13 + 22;
    const campo = (rotulo, valor, s = 15) => {
      font('normal', 11.5, VERDE);
      doc.text(rotulo, left, top);
      top += 7;
      font('bold', s, VERDE);
      const ls = wrap(valor, w);
      ls.forEach((l, i) => doc.text(l, left, top + i * pt(s) * 1.25));
      top += ls.length * pt(s) * 1.25 + 9;
    };
    campo('Identificador', bl.identificador, 16);
    campo('Título', bl.tituloRegistro, 14.5);
    font('normal', 11.5, VERDE);
    doc.text('Responsável', left, top);
    top += 3;
    font('bold', 11);
    const linhas = wrap(bl.responsavel.linha, w - 8);
    font('normal', 10);
    const extras = bl.responsavel.extras.flatMap((e) => wrap(e, w - 8));
    const altura = 4 + 5.5 + linhas.length * 5.2 + extras.length * 4.8 + 3;
    doc.setFillColor(...TINTA);
    doc.rect(left, top, w, altura, 'F');
    let yy = top + 6.5;
    font('normal', 9.5, VERDE);
    doc.text(bl.responsavel.tipo, left + 4, yy);
    yy += 6;
    font('bold', 11, VERDE);
    linhas.forEach((l) => { doc.text(l, left + 4, yy); yy += 5.2; });
    font('normal', 10, VERDE);
    extras.forEach((l) => { doc.text(l, left + 4, yy); yy += 4.8; });
    font('normal', 8.5, CINZA);
    doc.text(wrap(bl.emissao, w), left, H() - 18);
  };

  // -------------------------------------------------------------------------
  // Certificação: assinatura, hash master, QR code do validador
  const drawCertification = (bl) => {
    const w = width();
    font('bold', 17, VERDE);
    doc.text('Certificação', left, y + 6);
    y += 14;
    // Selo da assinatura digital.
    const a = bl.assinatura;
    const caixa = (titulo, subtitulo, corpo, cor) => {
      // Itens do corpo: texto (quebrado por palavras) ou { hash } (quebrado entre caracteres, letra menor).
      const corpoLinhas = corpo.flatMap((c) => {
        if (typeof c === 'object') { font('bold', 8.2); return splitChars(c.hash, w - 52).map((t) => ({ t, s: 8.2, style: 'bold' })); }
        font('normal', 9.5);
        return wrap(c, w - 52).map((t) => ({ t, s: 9.5 }));
      });
      const h = Math.max(30, 12 + corpoLinhas.reduce((t, l) => t + pt(l.s) * 1.35, 0) + 4);
      ensure(h + 4);
      doc.setDrawColor(...cor);
      doc.setLineWidth(0.8);
      doc.setFillColor(250, 251, 247);
      doc.roundedRect(left, y, w, h, 3, 3, 'FD');
      doc.setFillColor(...cor);
      doc.roundedRect(left + 2.5, y + 2.5, 40, h - 5, 2, 2, 'F');
      font('bold', 10.5, [255, 255, 255]);
      doc.text(wrap(titulo, 34), left + 22.5, y + h / 2 - 2, { align: 'center' });
      font('normal', 7.5, [255, 255, 255]);
      doc.text(wrap(subtitulo, 34), left + 22.5, y + h / 2 + 5, { align: 'center' });
      let yy = y + 8;
      corpoLinhas.forEach((l, i) => {
        font(i === 0 ? 'bold' : l.style ?? 'normal', l.s, i === 0 ? VERDE : ESCURO);
        doc.text(l.t, left + 48, yy);
        yy += pt(l.s) * 1.35;
      });
      y += h + 5;
    };
    if (a) {
      caixa('ASSINATURA DIGITAL', a.icpBrasil ? 'ICP-Brasil - PAdES' : 'PAdES', [
        `Assinado por ${a.titular}`,
        `${a.cpf ? `CPF ${a.cpf}` : ''}${a.cnpj ? `${a.cpf ? ' - ' : ''}CNPJ ${a.cnpj}` : ''}`,
        `Certificado ${a.tipo} A1 emitido por ${a.emissor}`,
        `Número de série ${a.numeroSerie}`,
        `Válido de ${a.validoDe.slice(0, 10).split('-').reverse().join('/')} a ${a.validoAte.slice(0, 10).split('-').reverse().join('/')}`,
      ].filter(Boolean), VERDE);
    } else {
      caixa('SEM ASSINATURA DIGITAL', 'nesta emissão', [
        'Relatório não assinado digitalmente',
        'A integridade do registro é demonstrada pelo código de verificação e pelos códigos hash. Para proteger o próprio documento, recomenda-se assiná-lo com certificado ICP-Brasil, no padrão PAdES.',
      ], CLARO);
    }
    // Hash master.
    caixa('HASH MASTER', 'SHA-256 do arquivo analisado', ['Conversa exportada examinada', ...bl.master.flatMap((m) => [m.nome, { hash: m.hash }])], VERDE);
    font('normal', 9, CINZA);
    writeLines(wrap('* A assinatura digital consta somente do arquivo PDF original. A impressão, a edição ou um novo salvamento do PDF por outro programa impedem a validação da assinatura (veja a seção Validação do registro).', w), left, w);
    y += 6;
    // Validador online.
    font('bold', 15, VERDE);
    ensure(60);
    doc.text('Validador online', left, y + 5);
    y += 11;
    const lado = 42;
    const m = qrMatrix(bl.validador.link);
    const cel = lado / m.length;
    doc.setFillColor(...PRETO);
    m.forEach((row, r) => row.forEach((dark, c) => { if (dark) doc.rect(left + c * cel, y + r * cel, cel + 0.02, cel + 0.02, 'F'); }));
    const tx = left + lado + 10;
    const tw = w - lado - 10;
    let yy = y + 3;
    const item = (rotulo, valor, s, link) => {
      font('normal', 9, CINZA);
      doc.text(rotulo, tx, yy);
      yy += 5;
      font('bold', s, ESCURO);
      const ls = splitChars(valor, tw);
      ls.forEach((l) => { doc.text(l, tx, yy); yy += pt(s) * 1.3; });
      if (link) doc.link(tx, yy - ls.length * pt(s) * 1.3 - 3, tw, ls.length * pt(s) * 1.3 + 1, { url: link });
      yy += 3;
    };
    item('Validação deste relatório e dos seus arquivos:', bl.validador.link, 9, bl.validador.link);
    item('Página de verificação:', bl.validador.base, 11, bl.validador.base);
    item(`Código de verificação (SHA-256 de ${bl.arquivoJson}):`, bl.codigo, 7.5);
    y = Math.max(y + lado, yy) + 8;
    font('bold', 13, VERDE);
    ensure(30);
    doc.text('Importante', left, y + 4);
    y += 9;
    font('normal', 10);
    writeLines(wrap('Cada parte que receber este relatório deve conferir a sua integridade e a dos arquivos que o acompanham, pelo validador online, pela página de verificação do pacote ou pelos comandos do próprio sistema operacional. Se algum arquivo não corresponder aos códigos registrados, ou se a assinatura digital do PDF não for validada, o arquivo deve ser desconsiderado ou submetido a perícia.', w), left, w);
  };

  // -------------------------------------------------------------------------
  // Print em página inteira
  const drawPrintPage = (bl) => {
    const deitada = bl.dataUrl && bl.width / bl.height > 1.15;
    newPage(deitada ? 'landscape' : 'portrait');
    const w = width();
    // Faixa técnica: arquivo, tamanho, registro, hashes e origem.
    font('normal', 9);
    const cab = [`Arquivo: `, bl.arquivo, ` - ${bl.tamanho}`, `  Registrado em: `, bl.registrado];
    const hashLines = hashBlockLines(bl.hashes, w - 4, 6);
    font('normal', 8);
    const origem = wrap(`Origem: ${bl.origem}`, w - 4);
    font('bold', 9);
    const titulo = richWrap([
      { text: `Print ${bl.indice} de ${bl.total} - ` }, { text: cab[0] }, { text: cab[1], bold: true }, { text: cab[2] }, { text: cab[3] }, { text: cab[4] },
    ], w - 4);
    const hStrip = 2 + titulo.length * pt(9) * 1.35 + hashLines.length * pt(6) * 1.35 + origem.length * pt(8) * 1.35 + 2;
    doc.setFillColor(...TINTA);
    doc.setDrawColor(...LINHA);
    doc.setLineWidth(0.2);
    doc.rect(left, y, w, hStrip, 'FD');
    y += 2;
    font('normal', 9, ESCURO);
    titulo.forEach((l, i) => { drawRich(l, left + 2, w - 4, true); y += lh; });
    font('normal', 6, CINZA);
    hashLines.forEach((l) => { doc.text(l, left + 2, y + lh * 0.75); y += lh; });
    font('normal', 8, VERDE);
    origem.forEach((l) => { doc.text(l, left + 2, y + lh * 0.75); y += lh; });
    y = y + 2 + 3;
    // Comparação abaixo da imagem.
    font('normal', 9.5);
    const labelW = 55;
    const linhas = bl.linhas.map((l) => {
      font('bold', 9.5);
      const lab = wrap(l.label, labelW - 3);
      font('normal', 9.5);
      return { lab, val: richWrap(l.segments, w - labelW) };
    });
    const hLinhas = linhas.reduce((t, l) => t + Math.max(l.lab.length, l.val.length) * pt(9.5) * 1.35 + 1, 0);
    const disponivel = Math.max(40, bottom() - y - hLinhas - 4);
    if (bl.dataUrl) {
      const ratio = Math.min(w / bl.width, disponivel / bl.height);
      const iw = bl.width * ratio;
      const ih = bl.height * ratio;
      const ix = left + (w - iw) / 2;
      try {
        doc.addImage(bl.dataUrl, 'JPEG', ix, y, iw, ih);
        doc.setDrawColor(...LINHA);
        doc.setLineWidth(0.3);
        doc.rect(ix, y, iw, ih);
      } catch { /* imagem inválida: só os dados do print */ }
      y += ih + 4;
    } else {
      font('normal', 10, CINZA);
      writeLines(wrap(bl.semImagem, w), left, w);
      y += 4;
    }
    for (const l of linhas) {
      const n = Math.max(l.lab.length, l.val.length);
      for (let i = 0; i < n; i++) {
        if (y + lh > bottom()) newPage();
        if (l.lab[i]) { font('bold', 9.5, VERDE); doc.text(l.lab[i], left, y + lh * 0.75); }
        if (l.val[i]) { font('normal', 9.5, ESCURO); drawRich(l.val[i], left + labelW, w - labelW, i === l.val.length - 1); }
        y += lh;
      }
      y += 1;
    }
    // O conteúdo seguinte começa em nova página retrato.
    y = bottom() + 1;
  };

  // -------------------------------------------------------------------------
  // Tabela com cabeçalho repetido nas quebras de página
  const drawTable = (bl) => {
    const w = width();
    const xs = [];
    let acc = left;
    for (const c of bl.columns) { xs.push(acc); acc += c.width * w; }
    const cw = bl.columns.map((c) => c.width * w - 3);
    const header = () => {
      font('normal', 9, VERDE);
      const titulos = bl.columns.map((c, i) => wrap(c.title, cw[i]));
      const n = Math.max(...titulos.map((t) => t.length));
      const h = 3 + n * pt(9) * 1.3;
      doc.setFillColor(...TINTA);
      doc.rect(left, y, w, h, 'F');
      font('normal', 9, VERDE);
      titulos.forEach((t, i) => t.forEach((l, k) => doc.text(l, xs[i] + 1.5, y + 4.6 + k * pt(9) * 1.3)));
      y += h + 1.5;
    };
    ensure(20);
    header();
    for (const row of bl.rows) {
      const cells = row.map((cell, i) => {
        const out = [];
        if (cell.title) { font('bold', 8.5); wrap(cell.title, cw[i]).forEach((t) => out.push({ t, style: 'bold', s: 8.5, color: ESCURO })); }
        if (cell.text) { font('normal', 8.5); wrap(cell.text, cw[i]).forEach((t) => out.push({ t, style: 'normal', s: 8.5, color: ESCURO })); }
        if (cell.small) { font('normal', 6.5); wrap(cell.small, cw[i]).forEach((t) => out.push({ t, style: 'normal', s: 6.5, color: CINZA })); }
        if (cell.hashes) hashBlockLines(cell.hashes, cw[i], 5.8).forEach((t) => out.push({ t, style: 'normal', s: 5.8, color: CINZA }));
        return out;
      });
      const h = Math.max(...cells.map((c) => c.reduce((t, l) => t + pt(l.s) * 1.35, 0))) + 2;
      if (y + h > bottom()) { newPage(); header(); }
      cells.forEach((c, i) => {
        let yy = y;
        for (const l of c) {
          font(l.style, l.s, l.color);
          doc.text(l.t, xs[i] + 1.5, yy + pt(l.s) * 1.35 * 0.75);
          yy += pt(l.s) * 1.35;
        }
      });
      y += h;
      doc.setDrawColor(...LINHA);
      doc.setLineWidth(0.2);
      doc.line(left, y, left + w, y);
      y += 1.5;
    }
    y += 3;
  };

  // -------------------------------------------------------------------------
  let primeira = true;
  for (const bl of blocks) {
    const w = width();
    switch (bl.type) {
      case 'cover':
        drawCover(bl);
        break;
      case 'pagebreak':
        if (!primeira || doc.getNumberOfPages() > 1 || capas.size) newPage();
        break;
      case 'section':
        ensure(22);
        y += 3;
        font('bold', 17, VERDE);
        writeLines(wrap(bl.text, w), left, w, { justify: false });
        y += 3;
        break;
      case 'h2':
        ensure(16);
        y += 4;
        font('bold', 13.5, VERDE);
        writeLines(wrap(bl.text, w), left, w, { justify: false });
        y += 1.5;
        break;
      case 'h3':
        ensure(12);
        y += 2;
        font('bold', 10.5, VERDE);
        writeLines(wrap(bl.text, w), left, w, { justify: false });
        y += 0.5;
        break;
      case 'lead':
        font('normal', 10.5, CINZA);
        if (bl.text === '(próxima página)') { font('bold', 9, CINZA); y += 3; }
        writeLines(wrap(bl.text, w), left, w);
        y += 2.5;
        break;
      case 'p':
        font('normal', 10, ESCURO);
        writeLines(wrap(bl.text, w), left, w);
        y += 2.2;
        break;
      case 'band': {
        const vs = bl.big ? 15 : 10.5;
        font('bold', vs);
        const vl = wrap(bl.value, w - 4);
        ensure(10 + vl.length * pt(vs) * 1.35 + (bl.sub ? 4 : 0));
        faixaRotulo(bl.label);
        font('bold', vs, CINZA);
        writeLines(vl, left + 2, w - 4, { justify: false });
        if (bl.sub) { font('normal', 7, CINZA); writeLines(wrap(bl.sub, w - 4), left + 2, w - 4, { justify: false }); }
        y += 4;
        break;
      }
      case 'bandRow': {
        const n = bl.cols.length;
        const cw = w / n;
        ensure(22);
        const top = y;
        doc.setFillColor(...TINTA);
        doc.rect(left, y, w, pt(10.5) * 1.9, 'F');
        font('normal', 10.5, VERDE);
        bl.cols.forEach((c, i) => doc.text(c.label, left + i * cw + 2, y + pt(10.5) * 1.9 * 0.68));
        y = top + pt(10.5) * 1.9 + 1.6;
        let maxY = y;
        bl.cols.forEach((c, i) => {
          let yy = y;
          font('bold', 11, CINZA);
          doc.text(c.value, left + i * cw + 2, yy + pt(11) * 1.35 * 0.75);
          yy += pt(11) * 1.35;
          if (c.sub) { font('normal', 6.5, CINZA); doc.text(c.sub, left + i * cw + 2, yy + pt(6.5) * 1.35 * 0.75); yy += pt(6.5) * 1.35; }
          maxY = Math.max(maxY, yy);
        });
        y = maxY + 5;
        break;
      }
      case 'files': {
        ensure(24);
        faixaRotulo(bl.label);
        for (const it of bl.items) {
          font('bold', 10);
          const nome = wrap(it.nome, w - 4);
          const n = nome.length + 1 + it.hashes.length * 2;
          ensure(Math.min(n * 3.6, 30));
          font('bold', 10, CINZA);
          writeLines(nome, left + 2, w - 4, { justify: false });
          font('normal', 9, CINZA);
          writeLines(wrap(`(${it.detalhe}) - ${it.descricao}`, w - 4), left + 2, w - 4, { justify: false });
          drawHashes(it.hashes, left + 2, w - 4, 6.3);
          y += 2.2;
        }
        y += 3;
        break;
      }
      case 'certification':
        drawCertification(bl);
        break;
      case 'printPage':
        drawPrintPage(bl);
        break;
      case 'table':
        drawTable(bl);
        break;
      case 'kv': {
        const labelW = 55;
        const vw = w - labelW;
        font('bold', 9.5);
        const labelLines = wrap(bl.label, labelW - 3);
        font('normal', 9.5);
        const isUrl = /^https?:\/\/\S+$/.test(bl.value);
        const rich = bl.segments ? richWrap(bl.segments, vw) : null;
        const valueLines = rich ?? (isUrl ? splitChars(bl.value, vw) : wrap(bl.value, vw));
        const n = Math.max(labelLines.length, valueLines.length);
        ensure(lh * Math.min(n, 3));
        for (let i = 0; i < n; i++) {
          ensure(lh);
          if (labelLines[i]) { font('bold', 9.5, ESCURO); justifyText(doc, labelLines[i], left, y + lh * 0.75, labelW - 3, i === labelLines.length - 1); }
          if (valueLines[i]) {
            font('normal', 9.5, ESCURO);
            if (rich) drawRich(valueLines[i], left + labelW, vw, i === valueLines.length - 1);
            else if (isUrl) {
              doc.text(valueLines[i], left + labelW, y + lh * 0.75);
              doc.link(left + labelW, y, doc.getTextWidth(valueLines[i]), lh, { url: bl.value });
            } else justifyText(doc, valueLines[i], left + labelW, y + lh * 0.75, vw, i === valueLines.length - 1);
          }
          y += lh;
        }
        y += 0.8;
        break;
      }
      case 'hash': {
        font('bold', 8.5, ESCURO);
        const lab = wrap(bl.label, w);
        font('normal', 7.5);
        const val = splitChars(bl.value, w);
        ensure((lab.length + val.length) * lh);
        font('bold', 8.5, ESCURO);
        writeLines(lab, left, w, { justify: false });
        font('normal', 7.5, CINZA);
        writeLines(val, left, w, { justify: false });
        y += 1;
        break;
      }
      case 'code': {
        font('normal', 8.5, ESCURO);
        const lines = bl.lines.flatMap((l) => splitChars(l, w - 8));
        ensure(Math.min(lines.length * lh + 4, bottom() - TOPO));
        const top = y;
        y += 2;
        for (const l of lines) { ensure(lh + 2); doc.text(l, left + 4, y + lh * 0.75); y += lh; }
        y += 2;
        doc.setDrawColor(...LINHA);
        doc.setLineWidth(0.3);
        if (doc.getCurrentPageInfo().pageNumber && y > top) doc.rect(left, top, w, y - top);
        y += 3;
        break;
      }
      case 'space':
        y += 3;
        break;
      case 'sign': {
        font('normal', 10);
        ensure(lh * bl.lines.length + 28);
        y += 20;
        doc.setDrawColor(...PRETO);
        doc.setLineWidth(0.3);
        doc.line(left + w / 2 - 50, y, left + w / 2 + 50, y);
        y += 2;
        bl.lines.forEach((l) => { font('normal', 10, ESCURO); doc.text(l, left + w / 2, y + lh * 0.75, { align: 'center' }); y += lh; });
        y += 6;
        break;
      }
      case 'footnote':
        font('normal', 7.5, CINZA);
        ensure(bl.lines.length * 4 + 6);
        y += 4;
        for (const l of bl.lines) writeLines(wrap(l, w), left, w, { justify: false });
        break;
      default:
        break;
    }
    primeira = false;
  }

  // Cabeçalho e rodapé em todas as páginas, exceto a capa.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    if (capas.has(i)) continue;
    doc.setPage(i);
    const pw = W();
    const ph = H();
    const w = pw - 2 * MARGEM;
    if (meta.simbolo) doc.addImage(meta.simbolo, 'PNG', left, 10, 26, 26 * (94 / 307), 'simbolo-cor');
    font('bold', 15, VERDE);
    doc.text('TalkEncript', left + 29, 16.2);
    font('normal', 8.5, VERDE);
    doc.text(['Integridade e preservação', 'de provas digitais'], left + w, 13, { align: 'right' });
    doc.setDrawColor(...LINHA);
    doc.setLineWidth(0.2);
    doc.line(left, ph - 16, left + w, ph - 16);
    font('normal', 6.8, CINZA);
    doc.text(`Identificador ${meta.id}  |  Código de verificação ${meta.verificationCode}`, left, ph - 12.5);
    doc.text(`${APP.rotulo} (${APP.edicao}), criado por ${APP.criador.nome}, ${APP.criador.oab}`, left, ph - 9.2);
    font('bold', 8, VERDE);
    doc.text(`Página ${i} de ${pages}`, left + w, ph - 9.2, { align: 'right' });
  }
  return doc.output('arraybuffer');
}
