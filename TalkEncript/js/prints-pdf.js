// Prints condensados em PDF para juntada aos autos: os prints juntados pelo operador
// são reunidos em grade (até seis por página, em duas linhas de três), com o cabeçalho técnico do Relatório e,
// ao final de cada parte, a identificação de cada print (mensagem descrita, resultado da
// comparação e SHA-256). Cada arquivo tem no máximo o limite escolhido (4 MB por
// padrão); quando os prints ultrapassam esse limite, o documento é dividido em partes.
// Prints em PDF têm cada página reproduzida integralmente em uma célula da grade.

import { PDFDocument } from '../vendor/pdf-lib.esm.min.js';
import { BAR, HEADER_Y, VERDE, technicalHeader } from './cabecalho.js';
import { justifyText } from './justify.js';
import { APP } from './report.js';

// Limites em unidades decimais (4 MB = 4.000.000 bytes), que também ficam abaixo do
// mesmo valor quando o sistema exibe o tamanho em unidades binárias.
export const LIMITES_PRINTS_PDF = [2_000_000, 3_000_000, 4_000_000, 5_000_000, 10_000_000];
export const LIMITE_PRINTS_PDF = 4_000_000;
const SIZE = 12;
const BLACK = [0, 0, 0];
const PAGE = { w: 210, h: 297 };
const MARGIN = { x: 20, bottom: 26 };
const LH = SIZE * 0.3528 * 1.3;
const COLS = 3;
const GAP = 4;
const CAPTION = LH + 1.5;
const MM = 72 / 25.4;

/** Nome de cada arquivo: Prints_<nº>.pdf ou, se dividido, Prints parte 1 de 3_<nº>.pdf. */
export function printsPdfName(id, parte, total) {
  return total > 1 ? `Prints parte ${parte} de ${total}_${id}.pdf` : `Prints_${id}.pdf`;
}

/** Formato da imagem pelos primeiros bytes (PNG ou JPEG), independentemente da extensão. */
export function imageFormat(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'PNG';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'JPEG';
  return null;
}

// Cada imagem é uma unidade da grade; cada página de um print em PDF também.
async function toUnits(prints) {
  const units = [];
  for (const print of prints) {
    if (print.tipo === 'pdf') {
      const src = await PDFDocument.load(print.bytes, { ignoreEncryption: true });
      const n = src.getPageCount();
      for (let k = 0; k < n; k++) {
        const { width, height } = src.getPage(k).getSize();
        units.push({ print, pagina: k, paginas: n, largura: width, altura: height });
      }
    } else {
      units.push({ print });
    }
  }
  return units;
}

async function buildPart(jsPDF, fonts, meta, units, parte, totalPartes) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Arial-Regular.ttf', fonts.regular);
  doc.addFont('Arial-Regular.ttf', 'Arial', 'normal');
  doc.addFileToVFS('Arial-Bold.ttf', fonts.bold);
  doc.addFont('Arial-Bold.ttf', 'Arial', 'bold');
  const rotuloParte = totalPartes > 1 ? `, parte ${parte} de ${totalPartes}` : '';
  doc.setProperties({
    title: `Prints do Relatório ${meta.id}${rotuloParte}`,
    subject: 'Prints juntados pelo operador, condensados para juntada aos autos',
    creator: `${APP.rotulo}, ${APP.edicao} (${APP.criador.nome}, ${APP.criador.oab})`,
  });
  const left = MARGIN.x;
  const width = PAGE.w - 2 * MARGIN.x;
  const bottom = PAGE.h - MARGIN.bottom;
  const topNext = HEADER_Y + BAR + 7;
  const header = technicalHeader(doc, meta, left, width, 'TALK ENCRIPT  |  PRINTS');
  const font = (style = 'normal', color = BLACK) => { doc.setFont('Arial', style); doc.setFontSize(SIZE); doc.setTextColor(...color); };
  const wrap = (text, w) => doc.splitTextToSize(String(text), w).flatMap((l) => {
    if (doc.getTextWidth(l) <= w) return [l];
    const out = [];
    let cur = '';
    for (const ch of l) { if (cur && doc.getTextWidth(cur + ch) > w) { out.push(cur); cur = ch; } else cur += ch; }
    if (cur) out.push(cur);
    return out;
  });
  let y = header.bottom + 8;
  const ensure = (h) => { if (y + h > bottom) { doc.addPage(); y = topNext; } };
  const paragraph = (text, style = 'normal', color = BLACK) => {
    font(style, color);
    const lines = wrap(text, width);
    lines.forEach((l, k) => { ensure(LH); justifyText(doc, l, left, y + LH * 0.75, width, k === lines.length - 1); y += LH; });
  };

  const nomes = [...new Set(units.map((u) => u.print.indice))];
  paragraph(`Prints juntados pelo operador, condensados para juntada aos autos${rotuloParte}. ${(() => {
    const total = units[0]?.print.total ?? 0;
    if (nomes.length === total) return `Este documento reúne ${total === 1 ? 'o print juntado' : `os ${total} prints juntados`}.`;
    return `Este documento reúne ${nomes.length === 1 ? 'o print' : 'os prints'} ${nomes.join(', ')}, de um total de ${total}.`;
  })()} A identificação de cada print, com o nome do arquivo, a mensagem descrita, o resultado da comparação com a conversa exportada e o SHA-256, está ao final deste documento.`);
  y += 3;

  // Grade: imagens em pé e páginas de PDF, três por linha; imagens deitadas, duas por linha.
  const maxH = (PAGE.h - MARGIN.bottom - topNext) / 2 - CAPTION - GAP;
  const placeholders = [];
  let row = [];
  const flushRow = () => {
    if (!row.length) return;
    const rowH = Math.max(...row.map((c) => c.h)) + CAPTION;
    ensure(rowH + GAP);
    const page = doc.getCurrentPageInfo().pageNumber;
    let x = left;
    for (const c of row) {
      const ix = x + (c.cellW - c.w) / 2;
      if (c.unit.pagina == null) {
        doc.addImage(c.unit.print.bytes, c.unit.print.formato, ix, y, c.w, c.h, undefined, 'FAST');
      } else {
        placeholders.push({ page, x: ix, y, w: c.w, h: c.h, unit: c.unit });
      }
      doc.setDrawColor(...VERDE);
      doc.setLineWidth(0.3);
      doc.rect(ix, y, c.w, c.h);
      font('bold', VERDE);
      const legenda = `Print ${c.unit.print.indice}${c.unit.pagina != null ? `, pág. ${c.unit.pagina + 1}/${c.unit.paginas}` : ''}`;
      doc.text(legenda, ix, y + c.h + LH * 0.85);
      x += c.cellW + GAP;
    }
    y += rowH + GAP;
    row = [];
  };
  for (const u of units) {
    const p = u.print;
    if (u.pagina == null && (!p.largura || !p.altura)) Object.assign(p, (({ width: largura, height: altura }) => ({ largura, altura }))(doc.getImageProperties(p.bytes)));
    const iw = u.pagina == null ? p.largura : u.largura;
    const ih = u.pagina == null ? p.altura : u.altura;
    const deitada = iw > ih * 1.15;
    const cols = deitada ? 2 : COLS;
    const cw = (width - (cols - 1) * GAP) / cols;
    const ratio = Math.min(cw / iw, maxH / ih);
    const cell = { unit: u, cellW: cw, w: iw * ratio, h: ih * ratio, deitada };
    if (row.length && row[0].deitada !== deitada) flushRow();
    row.push(cell);
    if (row.length === cols) flushRow();
  }
  flushRow();

  // Identificação dos prints desta parte.
  y += 2;
  ensure(LH * 6);
  paragraph('IDENTIFICAÇÃO DOS PRINTS', 'bold', VERDE);
  y += 1;
  for (const indice of nomes) {
    const p = units.find((u) => u.print.indice === indice).print;
    ensure(LH * 5);
    paragraph(`Print ${p.indice} de ${p.total}: ${p.path}`, 'bold');
    if (p.tipo === 'pdf') {
      const pags = units.filter((u) => u.print === p).map((u) => u.pagina + 1);
      paragraph(`Arquivo PDF com ${units.find((u) => u.print === p).paginas} página(s); ${pags.length === 1 ? `reproduzida nesta parte a página ${pags[0]}` : `reproduzidas nesta parte as páginas ${pags[0]} a ${pags[pags.length - 1]}`}.`);
    }
    if (p.comprimido) paragraph('Imagem reproduzida com compressão para respeitar o tamanho máximo do arquivo; o original é o arquivo identificado pelo SHA-256 abaixo.');
    if (p.trecho) paragraph(`Mensagem descrita no print: "${p.trecho.replace(/\s*\n\s*/g, '" / "')}"`);
    paragraph(`Resultado da comparação: ${p.resultado}`);
    paragraph('SHA-256 do print:');
    paragraph(p.sha256);
    y += 2;
  }

  const total = doc.getNumberOfPages();
  for (let k = 1; k <= total; k++) {
    doc.setPage(k);
    header.drawBar(k, total);
    if (k === 1) header.drawIdentification();
    font();
    doc.setDrawColor(...VERDE);
    doc.setLineWidth(0.2);
    doc.line(left, PAGE.h - 18, left + width, PAGE.h - 18);
    doc.text(`Prints do Relatório nº ${meta.id}${rotuloParte}`, left, PAGE.h - 13);
    doc.text(`${APP.rotulo} (${APP.edicao})`, left, PAGE.h - 8);
  }

  let bytes = new Uint8Array(doc.output('arraybuffer'));
  if (placeholders.length) {
    // Páginas de prints em PDF: desenhadas na célula reservada, com o conteúdo original.
    const out = await PDFDocument.load(bytes);
    const sources = new Map();
    for (const ph of placeholders) {
      const p = ph.unit.print;
      if (!sources.has(p)) sources.set(p, await PDFDocument.load(p.bytes, { ignoreEncryption: true }));
      let embedded;
      try {
        embedded = await out.embedPage(sources.get(p).getPage(ph.unit.pagina));
      } catch {
        continue; // página sem conteúdo (em branco): fica apenas a moldura
      }
      const page = out.getPage(ph.page - 1);
      page.drawPage(embedded, { x: ph.x * MM, y: (PAGE.h - ph.y - ph.h) * MM, width: ph.w * MM, height: ph.h * MM });
    }
    bytes = await out.save({ useObjectStreams: true });
  }
  return { bytes, paginas: total, prints: nomes };
}

/**
 * @param prints [{ indice, total, path, tipo: 'imagem' | 'pdf', bytes, formato, largura, altura, sha256, trecho, resultado }]
 * @param options { limite, shrink(print, tentativa) => { bytes, formato, largura, altura } | null, onProgress }
 * @returns { partes: [{ nome, bytes, paginas, prints }], comprimidos: [caminhos], acimaDoLimite: [caminhos] }
 */
export async function renderPrintsPDF(jsPDF, fonts, meta, prints, { limite = LIMITE_PRINTS_PDF, shrink, onProgress = () => {} } = {}) {
  const units = await toUnits(prints);
  const build = (us, k = 1, n = 1) => buildPart(jsPDF, fonts, meta, us, k, n);
  const comprimidos = new Set();
  const acimaDoLimite = new Set();

  // Tamanho de cada unidade isolada; imagem que sozinha ultrapassa o limite é comprimida.
  const sizes = [];
  for (const [i, u] of units.entries()) {
    let size = (await build([u])).bytes.length;
    for (let tentativa = 1; size > limite && u.pagina == null && shrink && tentativa <= 8; tentativa++) {
      const menor = await shrink(u.print, tentativa);
      if (!menor) break;
      Object.assign(u.print, menor, { comprimido: true });
      comprimidos.add(u.print.path);
      size = (await build([u])).bytes.length;
    }
    if (size > limite) acimaDoLimite.add(u.print.path);
    sizes.push(size);
    onProgress(((i + 1) / units.length) * 0.6);
  }

  // Parte fixa de cada arquivo (fontes, cabeçalho e rodapé), medida com a menor unidade
  // sozinha e repetida: o que não cresce com a repetição é custo fixo.
  const menor = sizes.indexOf(Math.min(...sizes));
  const dupla = units.length ? (await build([units[menor], units[menor]])).bytes.length : 0;
  const base = units.length ? Math.max(2 * sizes[menor] - dupla, 0) : 0;

  // Distribuição pelas partes, pelo tamanho estimado; depois, conferência do tamanho real.
  let groups = [];
  let cur = [];
  let est = base;
  units.forEach((u, i) => {
    const d = Math.max(sizes[i] - base, 0);
    if (cur.length && est + d > limite * 0.97) { groups.push(cur); cur = []; est = base; }
    cur.push(u);
    est += d;
  });
  if (cur.length) groups.push(cur);

  for (let rodada = 0; rodada < 4 * units.length + 10; rodada++) {
    const partes = [];
    let ajuste = -1;
    for (const [k, g] of groups.entries()) {
      const parte = await build(g, k + 1, groups.length);
      if (parte.bytes.length > limite && g.length > 1) { ajuste = k; break; }
      partes.push({ nome: printsPdfName(meta.id, k + 1, groups.length), ...parte });
    }
    if (ajuste < 0) {
      onProgress(1);
      return { partes, comprimidos: [...comprimidos], acimaDoLimite: [...acimaDoLimite] };
    }
    // A parte passou do limite: a última unidade dela segue para a parte seguinte.
    const moved = groups[ajuste].pop();
    if (groups[ajuste + 1]) groups[ajuste + 1].unshift(moved); else groups.push([moved]);
    groups = groups.filter((g) => g.length);
  }
  throw new Error('não foi possível dividir os prints em arquivos dentro do tamanho máximo escolhido.');
}
