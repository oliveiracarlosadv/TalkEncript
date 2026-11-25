// Testes unitários (Node.js 20+): node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from '../vendor/fflate.esm.js';
import { isValidCPF, isValidMobile, isValidOAB, formatOAB, formatCPF, formatMobile, validateOperator, normalizeUrl, isValidIMEI, maskIMEI } from '../js/validators.js';
import { hashBlob, hashZipEntries, detectAlgorithm, normalizeHex } from '../js/hashing.js';
import { summarizeWhatsApp, summarizeTelegramJSON } from '../js/chat.js';
import { manifestLine, parseManifest, makeReportId, formatDateOnly, shellQuote, packageBaseName, googleMapsUrl } from '../js/report.js';

const sha = (algo, data) => createHash(algo).update(data).digest('hex');

test('CNPJ ou CPF do escritório ou empresa', async () => {
  const v = await import('../js/validators.js');
  assert.ok(v.isValidCNPJ('11.222.333/0001-81'));
  assert.ok(!v.isValidCNPJ('11.222.333/0001-80'));
  assert.ok(!v.isValidCNPJ('00.000.000/0000-00'));
  assert.equal(v.formatCNPJorCPF('11222333000181'), '11.222.333/0001-81');
  assert.equal(v.formatCNPJorCPF('52998224725'), '529.982.247-25');
  assert.ok(v.isValidCNPJorCPF('529.982.247-25'));
  const base = { nome: 'Maria Souza', email: 'm@x.com.br', celular: '(91) 98888-7777', cpf: '529.982.247-25', profissao: 'Advogada', consentimento: true };
  assert.deepEqual(v.validateOperator(base), {});
  assert.ok(v.validateOperator({ ...base, empresaDocumento: '11.222.333/0001-80' }).empresaDocumento);
});

test('CPF, celular e OAB', () => {
  assert.ok(isValidCPF('529.982.247-25'));
  assert.ok(!isValidCPF('529.982.247-24'));
  assert.ok(!isValidCPF('111.111.111-11'));
  assert.equal(formatCPF('52998224725'), '529.982.247-25');
  assert.ok(isValidMobile('(91) 98888-7777'));
  assert.ok(isValidMobile('+55 91 98888-7777'));
  assert.ok(!isValidMobile('(91) 3222-1111'));
  assert.equal(formatMobile('91988887777'), '(91) 98888-7777');
  assert.ok(isValidOAB('33996', 'PA'));
  assert.ok(!isValidOAB('33996', 'XX'));
  assert.equal(formatOAB('33996', 'PA'), 'OAB/PA 33.996');
  assert.equal(formatOAB('1234a', 'sp'), 'OAB/SP 1.234-A');
  const errors = validateOperator({ nome: 'Carlos', email: 'x', celular: '1', cpf: '1', advogado: true, consentimento: false, links: [{ titulo: 'Site', url: '' }] });
  assert.deepEqual(Object.keys(errors).sort(), ['celular', 'consentimento', 'cpf', 'email', 'links', 'nome', 'oab', 'profissao']);
  const ok = { nome: 'Carlos Oliveira', email: 'c@x.com.br', celular: '(91) 98888-7777', cpf: '529.982.247-25', profissao: 'Advogado', advogado: false, consentimento: true };
  assert.deepEqual(validateOperator({ ...ok, links: [{ titulo: 'Site', url: 'https://www.exemplo.com.br' }] }), {});
  assert.ok(validateOperator({ ...ok, links: [{ titulo: 'Site', url: 'javascript:alert(1)' }] }).links);
  assert.equal(normalizeUrl('www.exemplo.com.br'), 'https://www.exemplo.com.br');
  assert.ok(isValidIMEI('49-015420-323751-8'));
  assert.ok(!isValidIMEI('490154203237519'));
  assert.ok(!isValidIMEI('4901542032375'));
  assert.equal(maskIMEI('490154203237518'), '4901 •••••••• 518');
});

test('hash em blocos confere com o Node e algoritmo é identificado pelo tamanho', async () => {
  const data = new Uint8Array(9 * 1024 * 1024 + 17).map((_, i) => i % 251);
  const r = await hashBlob(new Blob([data]), ['md5', 'sha1', 'sha256', 'sha512']);
  assert.equal(r.sha256, sha('sha256', data));
  assert.equal(r.sha512, sha('sha512', data));
  assert.equal(r.md5, sha('md5', data));
  assert.equal(detectAlgorithm('BA7816BF 8F01CFEA 414140DE 5DAE2223 B00361A3 96177A9C B410FF61 F20015AD'), 'sha256');
  assert.equal(detectAlgorithm('90:01:50:98:3c:d2:4f:b0:d6:96:3f:7d:28:e1:7f:72'), 'md5');
  assert.equal(detectAlgorithm('abc'), null);
  assert.equal(normalizeHex(' AB:cd '), 'abcd');
});

test('itens do ZIP: deflate, armazenado, nomes UTF-8 e CRC-32', async () => {
  const chat = strToU8('[01/10/2026, 10:00:00] José: Olá\n');
  const photo = new Uint8Array(500_000).fill(7);
  const zip = zipSync({ '_chat.txt': [chat, { level: 0 }], 'mídias/foto ção.jpg': [photo, { level: 9 }], 'vazio/': {} });
  const entries = await hashZipEntries(new Blob([zip]), { wantText: (e) => e.path.endsWith('.txt') });
  const byPath = Object.fromEntries(entries.map((e) => [e.path, e]));
  assert.equal(byPath['_chat.txt'].sha256, sha('sha256', chat));
  assert.equal(byPath['mídias/foto ção.jpg'].sha512, sha('sha512', photo));
  assert.ok(entries.every((e) => e.crcOk));
  assert.equal(new TextDecoder().decode(byPath['_chat.txt'].text), '[01/10/2026, 10:00:00] José: Olá\n');
});

test('resumo de conversa do WhatsApp (iOS e Android) e do Telegram', () => {
  const ios = summarizeWhatsApp('[01/10/2026, 10:00:00] Maria: Oi\n[01/10/2026, 10:01:00] João: ‎<anexado: 0001-PHOTO.jpg>\ncontinuação da linha\n');
  assert.equal(ios.mensagens, 2);
  assert.equal(ios.anexosReferidos, 1);
  assert.deepEqual(ios.participantes.map((p) => p.nome), ['Maria', 'João']);
  const android = summarizeWhatsApp('01/10/2026 10:00 - As mensagens são protegidas\n01/10/2026 10:00 - Ana: Bom dia\n02/10/2026 08:15 - Bruno: <Mídia oculta>\n');
  assert.equal(android.mensagens, 2);
  assert.equal(android.ultimaMensagem, '02/10/2026 08:15');
  const tg = summarizeTelegramJSON(JSON.stringify({ name: 'Grupo', messages: [{ type: 'message', from: 'Ana', date: '2026-10-01T10:00:00' }, { type: 'service' }, { type: 'message', from: 'Bia', date: '2026-10-01T11:00:00', photo: 'x.jpg' }] }));
  assert.equal(tg.mensagens, 2);
  assert.equal(tg.anexosReferidos, 1);
});

test('manifesto no formato do sha256sum, com escape e leitura BSD', () => {
  const h = 'a'.repeat(64);
  assert.equal(manifestLine(h, 'Conversa com José.zip'), `${h} *Conversa com José.zip\n`);
  assert.equal(manifestLine(h, 'a\\b.txt'), `\\${h} *a\\\\b.txt\n`);
  const parsed = parseManifest(`﻿# comentário\r\n${h}  Conversa (1).zip\r\nSHA512 (x.zip) = ${'b'.repeat(128)}\r\n\\${h}  a\\\\b.txt\nlixo\n`);
  assert.deepEqual(parsed.entries.map((e) => e.path), ['Conversa (1).zip', 'x.zip', 'a\\b.txt']);
  assert.deepEqual(parsed.invalid, [5]);
});

test('endereço por extenso a partir das respostas do OpenStreetMap', async () => {
  const { parseNominatim, parsePhoton, parseOverpass, splitStreetType, lookupAddress } = await import('../js/address.js');
  const { createRequire } = await import('node:module');
  const fx = createRequire(import.meta.url)('./fixtures-endereco.cjs');
  assert.deepEqual(splitStreetType('Av. Almirante Barroso'), { tipo: 'Avenida', nome: 'Almirante Barroso' });
  assert.deepEqual(splitStreetType('Tv. Padre Eutíquio'), { tipo: 'Travessa', nome: 'Padre Eutíquio' });
  assert.deepEqual(splitStreetType('Boa Ventura da Silva'), { tipo: null, nome: 'Boa Ventura da Silva' });
  const a = parseNominatim(fx.nominatim);
  assert.equal(a.tipoLogradouro, 'Avenida');
  assert.equal(a.numero, '1500');
  assert.equal(a.bairro, 'Campina');
  assert.equal(a.estado, 'Pará (PA)');
  const ph = parsePhoton({ features: [{ properties: { street: 'Rua dos Mundurucus', housenumber: '10', district: 'Batista Campos', city: 'Belém', state: 'Pará', postcode: '66025660', country: 'Brasil' } }] });
  assert.equal(ph.tipoLogradouro, 'Rua');
  assert.equal(ph.cep, '66025-660');
  assert.equal(ph.estado, 'Pará (PA)');
  const near = parseOverpass(fx.overpass, -1.455833, -48.503887);
  assert.deepEqual(near.map((n) => n.numero), ['1510', '1490', '82']);
  assert.ok(near[0].distancia < near[2].distancia);
  // Nominatim fora do ar: usa o Photon; sem internet: informa o motivo.
  const calls = [];
  const fake = async (url) => {
    calls.push(String(url));
    if (String(url).includes('nominatim')) throw new Error('falha de rede');
    if (String(url).includes('photon')) return { ok: true, json: async () => ({ features: [{ properties: { street: 'Rua A', city: 'Belém', state: 'Pará', country: 'Brasil' } }] }) };
    return { ok: true, json: async () => ({ elements: [] }) };
  };
  const r = await lookupAddress(-1.45, -48.5, 20, { fetchFn: fake });
  assert.equal(r.fonte, 'Photon (OpenStreetMap)');
  assert.match(r.numerosMotivo, /nenhum número/);
  assert.equal(r.raio, 30);
  const off = await lookupAddress(-1.45, -48.5, 20, { fetchFn: async () => { throw new Error('sem rede'); } });
  assert.match(off.motivo, /sem conexão/);
});

test('transcrição integral: caracteres da fonte, emojis e linhas', async () => {
  const { supportedCodePoints, printableLine, splitLines } = await import('../js/transcript.js');
  const set = supportedCodePoints(readFileSync(new URL('../vendor/fonts/LiberationSans-Regular.ttf', import.meta.url)).toString('base64'));
  for (const ch of 'áàâãéêíóôõúüçÁÇ€ºª') assert.ok(set.has(ch.codePointAt(0)), ch);
  assert.ok(!set.has(0x1f600));
  assert.deepEqual(printableLine('\u200eOlá 😀\tfim', set), { text: 'Olá [U+1F600]    fim', replaced: 1, omitted: 1 });
  assert.deepEqual(splitLines('\ufeffa\r\nb\nc\rd'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(splitLines('a\n\nb\n'), ['a', '', 'b']);
});

test('identificador do relatório, datas e aspas do terminal', () => {
  assert.equal(makeReportId(new Date(2026, 9, 1, 15, 4, 5), new Uint8Array([1, 2, 255])), 'TE-20261001-150405-0102FF');
  assert.equal(formatDateOnly('2026-10-01'), '01/10/2026');
  assert.equal(shellQuote("d'Ana.zip"), "'d'\\''Ana.zip'");
  assert.equal(packageBaseName('TE-1', [{ nome: 'Maria Souza' }, { nome: 'João Lima' }]), 'Relatório Hash_Maria Souza e João Lima');
  assert.equal(packageBaseName('TE-1', [{ nome: 'Ana' }, { nome: 'Bia' }, { nome: 'Caio' }]), 'Relatório Hash_Ana, Bia e Caio');
  assert.equal(packageBaseName('TE-1', [{ nome: 'José/Silva: "Zé"?' }]), 'Relatório Hash_José Silva Zé');
  assert.equal(packageBaseName('TE-1', []), 'Relatório Hash_TE-1');
  assert.equal(googleMapsUrl(-1.4558331, -48.5038869), 'https://www.google.com/maps/search/?api=1&query=-1.455833,-48.503887');
  assert.ok(packageBaseName('TE-1', Array.from({ length: 30 }, (_, i) => ({ nome: `Participante Número ${i}` }))).endsWith('e outros'));
});

test('comparação do trecho do print com a conversa exportada', async () => {
  const { compareSnippet, countPdfPages } = await import('../js/compare.js');
  const texts = [{ arquivo: '_chat.txt', texto: '[01/10/2026, 10:03:05] Maria: Recebido. O valor combinado foi R$ 5.000,00, certo?\n[01/10/2026, 10:04:40] João: Isso mesmo, pagamento até o dia 15.\n' }];
  const ok = compareSnippet(texts, 'o VALOR combinado  foi r$ 5.000,00\nisso mesmo, pagamento ate o dia 15');
  assert.equal(ok.situacao, 'encontrado');
  assert.equal(ok.partes[1].ocorrencias[0].linha, 2);
  // Posição exata do trecho encontrado na linha original, para o destaque em negrito.
  const o0 = ok.partes[0].ocorrencias[0];
  assert.equal(o0.conteudo.slice(...o0.destaque), 'O valor combinado foi R$ 5.000,00');
  const o1 = ok.partes[1].ocorrencias[0];
  assert.equal(o1.conteudo.slice(...o1.destaque), 'Isso mesmo, pagamento até o dia 15');
  const { locateInLine } = await import('../js/compare.js');
  const linhaEmoji = 'Ana: 😀 ação   ÚNICA hoje';
  assert.equal(linhaEmoji.slice(...locateInLine(linhaEmoji, 'acao unica')), 'ação   ÚNICA');
  assert.equal(locateInLine(linhaEmoji, 'inexistente'), null);
  assert.equal(compareSnippet(texts, 'valor foi R$ 9.000,00').situacao, 'não encontrado');
  assert.equal(compareSnippet(texts, 'Recebido\nfrase inexistente aqui').situacao, 'parcialmente encontrado');
  assert.equal(compareSnippet(texts, '').situacao, 'não solicitada');
  assert.equal(compareSnippet([], 'qualquer').situacao, 'sem conversa em texto para comparar');
  assert.equal(countPdfPages(new TextEncoder().encode('<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page >>')), 2);
});

test('prints reunidos em PDF: documento único e divisão em partes pelo limite', async () => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  // O jsPDF é UMD: carregado como CommonJS a partir de uma cópia .cjs.
  const dir = mkdtempSync(join(tmpdir(), 'jspdf-'));
  writeFileSync(join(dir, 'jspdf.cjs'), readFileSync(new URL('../vendor/jspdf.umd.min.js', import.meta.url)));
  const { jsPDF } = createRequire(import.meta.url)(join(dir, 'jspdf.cjs'));
  const { renderPrintsPDF, imageFormat, printsPdfName } = await import('../js/prints-pdf.js');
  const { PDFDocument } = await import('../vendor/pdf-lib.esm.min.js');
  const font = (n) => readFileSync(new URL(`../vendor/fonts/${n}`, import.meta.url)).toString('base64');
  const fonts = { regular: font('LiberationSans-Regular.ttf'), bold: font('LiberationSans-Bold.ttf') };
  const png = new Uint8Array(readFileSync(new URL('../exemplos/Print da conversa.png', import.meta.url)));
  assert.equal(imageFormat(png), 'PNG');
  assert.equal(imageFormat(new Uint8Array([0xff, 0xd8, 0xff])), 'JPEG');
  const fonte = await PDFDocument.create();
  for (let i = 0; i < 3; i++) fonte.addPage([300, 400]).drawText(`Pagina ${i + 1}`, { x: 40, y: 200, size: 24 });
  const pdfBytes = await fonte.save();
  // PNG com ruído, diferente para cada print (o jsPDF reaproveita imagens iguais).
  const { zlibSync } = await import('../vendor/fflate.esm.js');
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ruido = (seed, w = 160, h = 120) => {
    let x = seed * 2654435761 >>> 0;
    const raw = new Uint8Array(h * (1 + w * 3));
    for (let r = 0; r < h; r++) for (let c = 0; c < w * 3; c++) { x = (x * 1664525 + 1013904223) >>> 0; raw[r * (1 + w * 3) + 1 + c] = x >>> 24; }
    const ihdr = new Uint8Array(13);
    new DataView(ihdr.buffer).setUint32(0, w);
    new DataView(ihdr.buffer).setUint32(4, h);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const parts = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array())];
    return Uint8Array.from(parts.flatMap((p) => [...p]));
  };
  const imagem = (i, n) => ({ indice: i, total: n, path: `print ${i}.png`, tipo: 'imagem', bytes: ruido(i), formato: 'PNG', largura: 160, altura: 120, sha256: String(i).repeat(64).slice(0, 64), trecho: 'Segue a foto.', resultado: 'MENSAGEM ENCONTRADA na conversa exportada' });
  const prints = [imagem(1, 3), { ...imagem(2, 3), path: 'print 2.pdf', tipo: 'pdf', bytes: pdfBytes, formato: null }, imagem(3, 3)];
  const meta = { id: 'TE-1', operador: 'Maria Souza', cabecalho: { relatorio: 'Relatório Hash_Teste', operador: 'Maria Souza', cpf: '529.982.247-25', motivo: 'Advogada', interlocutores: [{ nome: 'Ana', telefone: '(91) 98888-7777' }], dataGeracao: '01/10/2026' } };

  const unico = await renderPrintsPDF(jsPDF, fonts, meta, prints);
  assert.equal(unico.partes.length, 1);
  assert.equal(unico.partes[0].nome, 'Prints_TE-1.pdf');
  // Condensado: as 2 imagens e as 3 páginas do PDF em grade, e a identificação ao final.
  assert.ok(unico.partes[0].paginas <= 3, `páginas: ${unico.partes[0].paginas}`);
  assert.equal((await PDFDocument.load(unico.partes[0].bytes)).getPageCount(), unico.partes[0].paginas);
  assert.deepEqual(unico.partes[0].prints, [1, 2, 3]);

  // Limite pequeno (acima do maior print isolado): o documento é dividido e nenhuma parte passa do limite.
  const isolados = await Promise.all(prints.map(async (p) => (await renderPrintsPDF(jsPDF, fonts, meta, [{ ...p }])).partes[0].bytes.length));
  const limite = Math.max(...isolados) + 3000;
  assert.ok(limite < unico.partes[0].bytes.length, `isolados ${isolados} total ${unico.partes[0].bytes.length}`);
  const dividido = await renderPrintsPDF(jsPDF, fonts, meta, prints, { limite });
  assert.ok(dividido.partes.length > 1);
  for (const [k, parte] of dividido.partes.entries()) {
    assert.ok(parte.bytes.length <= limite, `${parte.nome}: ${parte.bytes.length} > ${limite}`);
    assert.equal(parte.nome, printsPdfName('TE-1', k + 1, dividido.partes.length));
  }
  assert.deepEqual([...new Set(dividido.partes.flatMap((p) => p.prints))], [1, 2, 3]);
  const paginas = await Promise.all(dividido.partes.map(async (p) => (await PDFDocument.load(p.bytes)).getPageCount()));
  assert.ok(paginas.every((n) => n >= 1));
});

test('quantidade de arquivos dentro do ZIP, no total e por extensão', async () => {
  const { describeZipContents } = await import('../js/report.js');
  const e = (...paths) => paths.map((path) => ({ path }));
  assert.deepEqual(describeZipContents(e('_chat.txt', 'a.jpg', 'pasta/b.JPG', 'c.ogg', 'd.ogg', 'e.ogg', 'LEIAME')), {
    total: '7 arquivos',
    extensoes: ['3 arquivos *.ogg', '2 arquivos *.jpg', '1 arquivo *.txt', '1 arquivo sem extensão'],
  });
  assert.deepEqual(describeZipContents(e('_chat.txt')), { total: '1 arquivo', extensoes: ['1 arquivo *.txt'] });
});

test('SHA3-512 confere com o Node e duração do vídeo MP4 lida durante o hash', async () => {
  const { hashBlob, createVideoProbe, REPORT_ALGOS } = await import('../js/hashing.js');
  const bytes = new TextEncoder().encode('TalkEncript SHA3-512');
  const h = await hashBlob(new Blob([bytes]), REPORT_ALGOS);
  assert.equal(h.sha3_512, createHash('sha3-512').update(bytes).digest('hex'));
  assert.equal(h.sha512, createHash('sha512').update(bytes).digest('hex'));
  // Caixa mvhd (versão 0): criação em 2026-10-01 13:02:00 UTC, escala 1000, duração 158 s,
  // dividida entre dois blocos para simular o corte entre leituras.
  const mvhd = new Uint8Array(40);
  const v = new DataView(mvhd.buffer);
  v.setUint32(0, 40);
  mvhd.set([0x6d, 0x76, 0x68, 0x64], 4);
  const criado = (Date.UTC(2026, 9, 1, 13, 2, 0) - Date.UTC(1904, 0, 1)) / 1000;
  v.setUint32(12, criado);
  v.setUint32(20, 1000);
  v.setUint32(24, 158000);
  const probe = createVideoProbe();
  probe.push(new Uint8Array([1, 2, 3, ...mvhd.slice(0, 15)]));
  probe.push(mvhd.slice(15));
  assert.deepEqual(probe.result(), { duracaoSegundos: 158, criadoEm: '2026-10-01T13:02:00.000Z' });
});

test('certificado A1: senha, dados do titular e assinatura PAdES cobrindo o PDF inteiro', async () => {
  const { readCertificate, signPdf, extractSignature, CertificadoError } = await import('../js/assinatura.js');
  const forge = (await import('../vendor/forge.esm.js')).default;
  const pfx = readFileSync(new URL('./fixtures/certificado-teste.pfx', import.meta.url));
  assert.throws(() => readCertificate(pfx, 'errada'), CertificadoError);
  assert.throws(() => readCertificate(pfx, 'teste1234', new Date('2040-01-01')), /vencido/);
  const cred = readCertificate(pfx, 'teste1234', new Date('2027-01-01'));
  assert.equal(cred.dados.titular, 'MARIA SOUZA DE TESTE');
  assert.equal(cred.dados.cpf, '529.982.247-25');
  assert.equal(cred.dados.tipo, 'e-CPF');
  assert.equal(cred.dados.icpBrasil, true);
  const { PDFDocument } = await import('../vendor/pdf-lib.esm.min.js');
  const doc = await PDFDocument.create();
  doc.addPage();
  const signed = await signPdf(await doc.save(), cred, { motivo: 'Teste', momento: new Date('2026-10-30T12:00:00Z') });
  const s = extractSignature(signed);
  assert.equal(s.range[0], 0);
  assert.equal(s.range[2] + s.range[3], signed.length, 'a assinatura deve cobrir o arquivo inteiro');
  // O resumo assinado (messageDigest) é o SHA-256 dos trechos cobertos.
  const cms = forge.asn1.fromDer(forge.util.binary.raw.encode(s.cms));
  const signerInfo = cms.value[1].value[0].value[4].value[0];
  const attrs = signerInfo.value[3].value;
  const digest = attrs.find((a) => forge.asn1.derToOid(a.value[0].value) === '1.2.840.113549.1.9.4').value[1].value[0].value;
  assert.equal(forge.util.bytesToHex(digest), createHash('sha256').update(s.conteudo).digest('hex'));
  assert.ok(attrs.some((a) => forge.asn1.derToOid(a.value[0].value) === '1.2.840.113549.1.9.16.2.47'), 'signing-certificate-v2 ausente');
  // A assinatura RSA confere com a chave pública do certificado.
  const md = forge.md.sha256.create();
  md.update(forge.asn1.toDer(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs)).getBytes());
  assert.ok(cred.certificado.publicKey.verify(md.digest().getBytes(), signerInfo.value[5].value));
  assert.ok(await PDFDocument.load(signed), 'o PDF assinado deve continuar legível');
});

test('relatório: duração, ambiente e validador online', async () => {
  const { formatDuration, formatClock, describeEnvironment, validadorLink } = await import('../js/report.js');
  const { parseFragment, expectedItems, parseManifestText } = await import('../js/verificador-online.js');
  assert.equal(formatDuration(758000), '12m 38s');
  assert.equal(formatDuration(3725000), '1h 02m 05s');
  assert.equal(formatClock(158), '00:02:38');
  assert.equal(describeEnvironment('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'), 'macOS - Google Chrome 141');
  assert.equal(describeEnvironment('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'), 'Windows 10 ou 11 - Microsoft Edge 141');
  const code = 'a'.repeat(64);
  const link = validadorLink('TE-20261030-104548-B2AAD6', code);
  assert.equal(link, `https://oliveiracarlosadv.github.io/TalkEncript-Verificar/#r=TE-20261030-104548-B2AAD6&c=${code}`);
  assert.deepEqual(parseFragment(new URL(link).hash), { id: 'TE-20261030-104548-B2AAD6', codigo: code });
  assert.deepEqual(parseFragment('#r=x&c=123'), { id: 'x', codigo: null });
  const itens = expectedItems({
    arquivos: [{ path: 'Conversa.zip', sha256: '1'.repeat(64), sha3_512: '2'.repeat(128), zipEntries: [{ path: '_chat.txt', sha256: '3'.repeat(64) }] }],
    prints: [{ path: 'print.png', sha256: '4'.repeat(64) }],
    metadados: [{ arquivo: 'ambiente_TE-1.json', sha256: '5'.repeat(64) }],
  });
  assert.deepEqual(itens.map((i) => i.caminho), ['Conversa.zip', 'Conversa/_chat.txt', 'print.png', 'ambiente_TE-1.json']);
  assert.deepEqual(parseManifestText(`${'6'.repeat(64)} *Relatório_TE-1.pdf\n`), [{ sha256: '6'.repeat(64), caminho: 'Relatório_TE-1.pdf' }]);
});
