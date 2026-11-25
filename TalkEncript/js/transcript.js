// Transcrição integral da conversa exportada (arquivo .txt) em PDF, linha a linha.
// A fonte é a mesma do relatório (Liberation Sans, métricas da Arial, tamanho 12).

import { APP } from './report.js';
import { justifyText } from './justify.js';
import { BAR, HEADER_Y, VERDE, technicalHeader } from './cabecalho.js';

const SIZE = 12;
const BLACK = [0, 0, 0];
const PAGE = { w: 210, h: 297 };
const MARGIN = { x: 20, top: HEADER_Y + BAR + 7, bottom: 26 };

// Caracteres invisíveis de formatação (marcas de direção do texto, junções e seletores de variação).
const INVISIBLE = /^[​-‏‪-‮⁠-⁤︎️﻿]$/u;

function base64ToBytes(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** Lê a tabela cmap de uma fonte TrueType e devolve o conjunto de códigos Unicode que ela desenha. */
export function supportedCodePoints(fontBase64) {
  const bytes = base64ToBytes(fontBase64);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = v.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
    if (tag === 'cmap') cmap = v.getUint32(rec + 8);
  }
  const set = new Set();
  if (cmap < 0) return set;
  const count = v.getUint16(cmap + 2);
  const subtables = [];
  for (let i = 0; i < count; i++) {
    const r = cmap + 4 + i * 8;
    subtables.push({ platform: v.getUint16(r), encoding: v.getUint16(r + 2), offset: cmap + v.getUint32(r + 4) });
  }
  const pick = subtables.find((s) => s.platform === 3 && s.encoding === 10) ?? subtables.find((s) => s.platform === 3 && s.encoding === 1) ?? subtables.find((s) => s.platform === 0);
  if (!pick) return set;
  const format = v.getUint16(pick.offset);
  if (format === 4) {
    const segX2 = v.getUint16(pick.offset + 6);
    const ends = pick.offset + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffsets = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = v.getUint16(ends + s * 2);
      const start = v.getUint16(starts + s * 2);
      const delta = v.getInt16(deltas + s * 2);
      const ro = v.getUint16(rangeOffsets + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let glyph;
        if (ro === 0) glyph = (c + delta) & 0xffff;
        else {
          const addr = rangeOffsets + s * 2 + ro + (c - start) * 2;
          glyph = v.getUint16(addr);
          if (glyph) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) set.add(c);
      }
    }
  } else if (format === 12) {
    const groups = v.getUint32(pick.offset + 12);
    for (let g = 0; g < groups; g++) {
      const r = pick.offset + 16 + g * 12;
      const start = v.getUint32(r);
      const end = v.getUint32(r + 4);
      const glyph = v.getUint32(r + 8);
      for (let c = start; c <= end; c++) if (glyph + (c - start)) set.add(c);
    }
  }
  return set;
}

/**
 * Prepara uma linha para o PDF: tabulação vira quatro espaços, caracteres invisíveis
 * de formatação são omitidos e caracteres que a fonte não desenha (como emojis)
 * aparecem como [U+XXXX]. Devolve o texto e a quantidade de substituições.
 */
export function printableLine(line, supported) {
  let out = '';
  let replaced = 0;
  let omitted = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0);
    if (ch === '\t') { out += '    '; continue; }
    if (INVISIBLE.test(ch)) { omitted++; continue; }
    if (cp < 0x20) { out += `[U+${cp.toString(16).toUpperCase().padStart(4, '0')}]`; replaced++; continue; }
    if (supported.has(cp)) out += ch;
    else { out += `[U+${cp.toString(16).toUpperCase().padStart(4, '0')}]`; replaced++; }
  }
  return { text: out, replaced, omitted };
}

/** Linhas do arquivo; a quebra de linha final do arquivo não conta como linha extra. */
export const splitLines = (text) => {
  const lines = text.replace(/^\ufeff/, '').split(/\r\n|\n|\r/);
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
};

/**
 * @param jsPDF classe do jsPDF
 * @param fonts { regular, bold } em base64
 * @param meta { id, operador, cabecalho, sources: [{ arquivo, sha256, texto }] }
 * @returns { bytes: ArrayBuffer, paginas, linhas, substituidos, omitidos }
 */
export function renderTranscriptPDF(jsPDF, fonts, meta, onProgress = () => {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Arial-Regular.ttf', fonts.regular);
  doc.addFont('Arial-Regular.ttf', 'Arial', 'normal');
  doc.addFileToVFS('Arial-Bold.ttf', fonts.bold);
  doc.addFont('Arial-Bold.ttf', 'Arial', 'bold');
  doc.setProperties({
    title: `Transcrição integral da conversa - Relatório ${meta.id}`,
    subject: 'Transcrição integral, linha a linha, do arquivo de texto da conversa exportada',
    creator: `${APP.rotulo}, ${APP.edicao} (${APP.criador.nome}, ${APP.criador.oab})`,
  });
  const supported = supportedCodePoints(fonts.regular);
  const lh = SIZE * 0.3528 * 1.3;
  const left = MARGIN.x;
  const width = PAGE.w - 2 * MARGIN.x;
  const gutter = 18;
  const textWidth = width - gutter;
  const bottom = PAGE.h - MARGIN.bottom;
  // Cabeçalho técnico (modelo A), o mesmo do Relatório.
  const header = technicalHeader(doc, meta, left, width, 'TALK ENCRIPT  |  TRANSCRIÇÃO INTEGRAL');
  let y = header.bottom + 8;
  const font = (style = 'normal') => { doc.setFont('Arial', style); doc.setFontSize(SIZE); doc.setTextColor(...BLACK); };
  const newPage = () => { doc.addPage(); y = MARGIN.top; };
  const ensure = (h) => { if (y + h > bottom) newPage(); };
  const splitChars = (text, maxWidth) => {
    const lines = [];
    let current = '';
    for (const ch of text) {
      if (doc.getTextWidth(current + ch) > maxWidth && current) { lines.push(current); current = ch; } else current += ch;
    }
    if (current) lines.push(current);
    return lines;
  };
  const wrap = (text, maxWidth) => (text === '' ? [''] : doc.splitTextToSize(text, maxWidth)
    .flatMap((l) => (doc.getTextWidth(l) > maxWidth ? splitChars(l, maxWidth) : [l])));
  const para = (text, style = 'normal') => {
    font(style);
    const lines = wrap(text, width);
    lines.forEach((l, i) => { ensure(lh); justifyText(doc, l, left, y + lh * 0.75, width, i === lines.length - 1); y += lh; });
  };

  let totalLines = 0;
  let replaced = 0;
  let omitted = 0;
  const totalAll = meta.sources.reduce((n, s) => n + splitLines(s.texto).length, 0) || 1;

  font('bold');
  doc.setTextColor(...VERDE);
  ensure(lh);
  doc.text('TRANSCRIÇÃO INTEGRAL DA CONVERSA EXPORTADA', left, y + lh * 0.75);
  y += lh;
  y += 1;
  para(`Anexo ao Relatório nº ${meta.id}. Reprodução integral, linha a linha, do arquivo de texto da conversa exportada, na ordem e com o conteúdo do original. A numeração à esquerda indica a linha do arquivo original e não faz parte dele; é a mesma numeração usada na seção Prints e comparação com a conversa exportada do Relatório.`);
  y += 1;
  para('Caracteres que a fonte do PDF não consegue desenhar, como emojis, aparecem como seu código Unicode entre colchetes (por exemplo, [U+1F600]); caracteres invisíveis de formatação, como as marcas de direção do texto inseridas pelo WhatsApp, são omitidos. O arquivo original, identificado pelo SHA-256 abaixo, continua sendo a referência exata do conteúdo.');

  for (const source of meta.sources) {
    const lines = splitLines(source.texto);
    y += 3;
    ensure(lh * 4);
    para(`Arquivo de origem: ${source.arquivo}`, 'bold');
    para('SHA-256 do arquivo de origem:');
    para(source.sha256 ?? 'não identificado');
    para(`Total de linhas: ${lines.length.toLocaleString('pt-BR')}`);
    y += 1;
    doc.setDrawColor(...VERDE);
    doc.setLineWidth(0.3);
    doc.line(left, y, left + width, y);
    y += 2;
    lines.forEach((raw, i) => {
      const { text, replaced: r, omitted: o } = printableLine(raw, supported);
      replaced += r;
      omitted += o;
      const parts = wrap(text, textWidth);
      ensure(lh);
      font('bold');
      doc.text(String(i + 1), left + gutter - 3, y + lh * 0.75, { align: 'right' });
      font();
      parts.forEach((part, k) => {
        if (k > 0) ensure(lh);
        justifyText(doc, part, left + gutter, y + lh * 0.75, textWidth, k === parts.length - 1);
        y += lh;
      });
      totalLines++;
      if (totalLines % 500 === 0) onProgress(totalLines / totalAll);
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    header.drawBar(i, pages);
    if (i === 1) header.drawIdentification();
    doc.setDrawColor(...VERDE);
    doc.setLineWidth(0.2);
    font();
    doc.line(left, PAGE.h - 18, left + width, PAGE.h - 18);
    doc.text(`Anexo ao Relatório nº ${meta.id}`, left, PAGE.h - 13);
    doc.text(`${APP.rotulo} (${APP.edicao})`, left, PAGE.h - 8);
  }
  onProgress(1);
  return { bytes: doc.output('arraybuffer'), paginas: pages, linhas: totalLines, substituidos: replaced, omitidos: omitted };
}
