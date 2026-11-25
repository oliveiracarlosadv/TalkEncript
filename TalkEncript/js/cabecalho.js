// Cabeçalho técnico dos PDFs do TalkEncript, comum ao Relatório, à Transcrição integral
// e aos prints: faixa verde com o símbolo, TALK ENCRIPT e a paginação em todas as páginas
// e, somente na primeira, o quadro de identificação em grade de três colunas alinhadas,
// com o rótulo em faixa clara e o valor abaixo.

import { justifyText } from './justify.js';

// Verde-oliva do símbolo do sistema (ramo de oliveira), cor institucional.
export const VERDE = [85, 107, 47];
const BLACK = [0, 0, 0];
export const HEADER_Y = 10;
export const BAR = 10;
const TINT = [238, 241, 230];
const SIZE = 12;
const LABEL = 7.5;
const VALUE = 10.5;
const VLH = 4.6;
const PAD = 3;
const LABEL_H = 5.2;
const TOP_PAD = 2.2;
const BOTTOM_PAD = 1.8;

/**
 * @param doc documento jsPDF com a fonte Arial já registrada
 * @param meta { id, operador, simbolo (PNG em base64, opcional), cabecalho: { relatorio, operador, escritorio, cpf, motivo, interlocutores: [{ nome, telefone, qualificacao }], dataGeracao } }
 * @param left margem esquerda (mm)
 * @param width largura útil (mm)
 * @param titulo texto da faixa; o que vier depois de "|" aparece como subtítulo
 * @returns { bottom, drawBar(page, pages), drawIdentification() }
 */
export function technicalHeader(doc, meta, left, width, titulo = 'TALK ENCRIPT') {
  const head = meta.cabecalho ?? {};
  const col = width / 3;
  const splitChars = (text, maxWidth) => {
    const lines = [];
    let current = '';
    for (const ch of text) {
      if (doc.getTextWidth(current + ch) > maxWidth && current) { lines.push(current); current = ch; } else current += ch;
    }
    if (current) lines.push(current);
    return lines;
  };
  // Linhas de um valor; cada trecho separado por \n é um parágrafo (a última linha não é justificada).
  const lines = (text, w, style = 'normal', color = BLACK) => {
    doc.setFont('Arial', style);
    doc.setFontSize(VALUE);
    return String(text ?? 'não informado').split('\n').flatMap((part) => {
      const ls = doc.splitTextToSize(part, w - 2 * PAD)
        .flatMap((l) => (doc.getTextWidth(l) > w - 2 * PAD ? splitChars(l, w - 2 * PAD) : [l]));
      return ls.map((t, k) => ({ t, last: k === ls.length - 1, style, color }));
    });
  };
  const cell = (label, value, x, span) => ({ label, x, w: span * col, lines: lines(value, span * col) });

  // Grade de três colunas iguais, alinhada em todas as linhas do quadro.
  const operadorSpan = head.escritorio ? 1 : 2;
  const rows = [
    [cell('RELATÓRIO HASH', head.relatorio ?? `Relatório nº ${meta.id}`, 0, 3)],
    [cell('Nº DO RELATÓRIO', meta.id, 0, 1), cell('DATA DE GERAÇÃO', head.dataGeracao, 1, 1), cell('MOTIVO', head.motivo, 2, 1)],
    [
      cell('OPERADOR', head.operador ?? meta.operador, 0, operadorSpan),
      ...(head.escritorio ? [cell('ESCRITÓRIO OU EMPRESA', head.escritorio, 1, 1)] : []),
      cell('CPF DO OPERADOR', head.cpf, 2, 1),
    ],
  ].map((cells) => ({ cells, height: LABEL_H + TOP_PAD + Math.max(...cells.map((c) => c.lines.length)) * VLH + BOTTOM_PAD }));

  // Interlocutores: um por coluna, até três por linha; nome em negrito, qualificação em
  // verde e telefone abaixo.
  const people = (head.interlocutores ?? []).map((it) => (typeof it === 'string' ? { nome: it } : it));
  const speakerCells = people.map((it, i) => [
    ...lines(`${i + 1}. ${it.nome || 'nome não informado'}`, col, 'bold'),
    ...(it.qualificacao ? lines(it.qualificacao, col, 'normal', VERDE) : []),
    ...lines(`Telefone: ${it.telefone || 'não informado'}`, col),
  ]);
  const speakerRows = [];
  for (let i = 0; i < speakerCells.length; i += 3) speakerRows.push(speakerCells.slice(i, i + 3));
  if (!speakerRows.length) speakerRows.push([lines('não informados', col)]);
  const speakerHeights = speakerRows.map((r) => TOP_PAD + Math.max(...r.map((c) => c.length)) * VLH + BOTTOM_PAD);
  const speakersH = LABEL_H + speakerHeights.reduce((t, h) => t + h, 0);
  const box = BAR + rows.reduce((t, r) => t + r.height, 0) + speakersH;

  const drawLines = (ls, x, y, w) => {
    ls.forEach((l, k) => {
      doc.setFont('Arial', l.style);
      doc.setFontSize(VALUE);
      doc.setTextColor(...l.color);
      justifyText(doc, l.t, x + PAD, y + 3.4 + k * VLH, w - 2 * PAD, l.last);
    });
    doc.setTextColor(...BLACK);
  };
  const drawLabel = (label, x, y, w) => {
    doc.setFillColor(...TINT);
    doc.rect(x, y, w, LABEL_H, 'F');
    doc.setFont('Arial', 'bold');
    doc.setFontSize(LABEL);
    doc.setTextColor(...VERDE);
    doc.text(label, x + PAD, y + 3.6);
    doc.setTextColor(...BLACK);
  };

  const [principal, subtitulo] = titulo.split('|').map((t) => t.trim());
  const drawBar = (page, pages) => {
    doc.setFillColor(...VERDE);
    doc.rect(left, HEADER_Y, width, BAR, 'F');
    let x = left + PAD;
    const simbolo = meta.simbolo ?? head.simbolo;
    if (simbolo) {
      // Símbolo do sistema (ramo de oliveira, em branco), proporção 307 x 94.
      const h = BAR - 3;
      const w = h * (307 / 94);
      doc.addImage(simbolo, 'PNG', x, HEADER_Y + 1.5, w, h, 'simbolo-talkencript');
      x += w + 3;
    }
    doc.setFont('Arial', 'bold');
    doc.setFontSize(SIZE);
    doc.setTextColor(255, 255, 255);
    doc.text(principal, x, HEADER_Y + 6.6);
    if (subtitulo) {
      const sx = x + doc.getTextWidth(principal) + 3;
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.line(sx, HEADER_Y + 2.6, sx, HEADER_Y + BAR - 2.6);
      doc.setFont('Arial', 'normal');
      doc.text(subtitulo, sx + 3, HEADER_Y + 6.6);
      doc.setFont('Arial', 'bold');
    }
    doc.text(`PÁGINA ${page} DE ${pages}`, left + width - PAD, HEADER_Y + 6.6, { align: 'right' });
    doc.setTextColor(...BLACK);
  };
  const drawIdentification = () => {
    let top = HEADER_Y + BAR;
    doc.setDrawColor(...VERDE);
    doc.setLineWidth(0.2);
    for (const row of rows) {
      for (const c of row.cells) {
        const x = left + c.x * col;
        drawLabel(c.label, x, top, c.w);
        drawLines(c.lines, x, top + LABEL_H + TOP_PAD, c.w);
        doc.setDrawColor(...VERDE);
        doc.setLineWidth(0.2);
        if (c.x > 0) doc.line(x, top, x, top + row.height);
      }
      top += row.height;
      doc.line(left, top, left + width, top);
    }
    drawLabel('INTERLOCUTORES', left, top, width);
    top += LABEL_H;
    speakerRows.forEach((r, i) => {
      const h = speakerHeights[i];
      r.forEach((ls, k) => {
        drawLines(ls, left + k * col, top + TOP_PAD, col);
        doc.setDrawColor(...VERDE);
        doc.setLineWidth(0.2);
        if (k > 0) doc.line(left + k * col, top, left + k * col, top + h);
      });
      top += h;
      if (i < speakerRows.length - 1) doc.line(left, top, left + width, top);
    });
    doc.setDrawColor(...VERDE);
    doc.setLineWidth(0.4);
    doc.rect(left, HEADER_Y, width, box);
  };
  return { bottom: HEADER_Y + box, drawBar, drawIdentification };
}
