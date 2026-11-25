// Montagem do relatório: dados estruturados (JSON), blocos de conteúdo
// (usados para TXT e PDF) e manifestos de verificação.

export const APP = {
  nome: 'TalkEncript',
  versao: '2.1',
  rotulo: 'GestorLaw - TalkEncript V 2.1',
  edicao: 'segunda versão',
  versaoDescricao: 'V 2.1 (segunda versão)',
  criador: {
    nome: 'Carlos Alexandre Albuquerque Oliveira',
    qualificacao: 'Advogado',
    oab: 'OAB/PA 33.996',
  },
  bibliotecas: [
    { nome: 'hash-wasm', versao: '4.12.0', licenca: 'MIT', uso: 'cálculo de SHA-2 (SHA-256 e SHA-512), SHA-3 (SHA3-512) e CRC-32' },
    { nome: 'fflate', versao: '0.8.2', licenca: 'MIT', uso: 'descompactação dos itens do ZIP e montagem do pacote' },
    { nome: 'jsPDF', versao: '4.2.1', licenca: 'MIT', uso: 'geração do relatório em PDF' },
    { nome: 'pdf-lib', versao: '1.17.1', licenca: 'MIT', uso: 'reunião dos prints em PDF, inclusive das páginas de prints em PDF' },
    { nome: 'Liberation Sans', versao: '2.1', licenca: 'SIL OFL 1.1', uso: 'fonte do PDF, com as mesmas métricas da Arial' },
    { nome: 'node-forge', versao: '1.3.1', licenca: 'BSD-3-Clause', uso: 'leitura do certificado A1 (.pfx) e assinatura digital do relatório' },
    { nome: 'qrcode-generator', versao: '1.4.4', licenca: 'MIT', uso: 'QR code do validador online' },
  ],
};

// Página pública de verificação (repositório oliveiracarlosadv/TalkEncript-Verificar). Ela
// confere os arquivos no navegador de quem recebe o relatório, sem enviar nada a servidor.
export const VALIDADOR_URL = 'https://oliveiracarlosadv.github.io/TalkEncript-Verificar/';
/** Endereço do QR code: o número do relatório e o código de verificação vão após o "#", parte que o navegador não envia ao servidor. */
export const validadorLink = (id, codigo) => `${VALIDADOR_URL}#r=${encodeURIComponent(id)}&c=${codigo}`;

export const PLATFORMS = ['WhatsApp', 'Telegram', 'Signal', 'Instagram', 'Facebook Messenger', 'E-mail', 'SMS', 'Outro'];

// ---------------------------------------------------------------------------
// Formatação

const pad = (n, l = 2) => String(n).padStart(l, '0');

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  const compact = unit === 0 ? `${n} bytes` : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[unit]}`;
  return unit === 0 ? compact : `${compact} (${n.toLocaleString('pt-BR')} bytes)`;
}

export function formatDateTime(iso, timeZone) {
  if (!iso) return 'não informado';
  const date = new Date(iso);
  const text = new Intl.DateTimeFormat('pt-BR', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replace(',', ' às');
  return text;
}

/** Data no formato AAAA-MM-DD (campo de data do formulário), sem conversão de fuso. */
export function formatDateOnly(value) {
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
}

export function offsetLabel(minutesWestOfUTC) {
  const total = -minutesWestOfUTC;
  const sign = total < 0 ? '-' : '+';
  const abs = Math.abs(total);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function makeReportId(date = new Date(), random = crypto.getRandomValues(new Uint8Array(3))) {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const suffix = [...random].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `TE-${stamp}-${suffix}`;
}

/** Link oficial do Google Maps (Maps URLs) para o ponto exato das coordenadas. */
export const googleMapsUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;

export const zipFolderName = (path) => path.split('/').pop().replace(/\.zip$/i, '');

/** Aspas simples para zsh e bash. */
export const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
export const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------------------
// Manifestos no formato do sha256sum / shasum, com o indicador binário: "hash *caminho".
// Um espaço seguido de asterisco é aceito pelo shasum (macOS) e pelo sha256sum (Linux)
// e não se perde quando o texto é copiado de um PDF, ao contrário dos dois espaços.

export function manifestLine(hash, path) {
  if (/[\\\n\r]/.test(path)) {
    const escaped = path.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    return `\\${hash} *${escaped}\n`;
  }
  return `${hash} *${path}\n`;
}

export function buildManifests(data) {
  const out = {};
  const files = data.arquivos.filter((f) => f.sha256);
  out.sha256 = files.map((f) => manifestLine(f.sha256, f.path)).join('');
  if (files.some((f) => f.sha512)) out.sha512 = files.map((f) => manifestLine(f.sha512, f.path)).join('');
  if (files.some((f) => f.sha3_512)) out.sha3_512 = files.map((f) => manifestLine(f.sha3_512, f.path)).join('');
  const inner = data.arquivos.flatMap((f) => (f.zipEntries ?? []).filter((e) => e.sha256).map((e) => manifestLine(e.sha256, `${zipFolderName(f.path)}/${e.path}`)));
  if (inner.length) out.zip = inner.join('');
  const prints = (data.prints ?? []).filter((f) => f.sha256);
  if (prints.length) out.prints = prints.map((f) => manifestLine(f.sha256, f.path)).join('');
  return out;
}

/** Lê manifestos nos formatos GNU (`hash  arquivo`) e BSD (`SHA256 (arquivo) = hash`). */
export function parseManifest(text) {
  const entries = [];
  const invalid = [];
  text.replace(/^﻿/, '').split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) return;
    const bsd = line.match(/^(MD5|SHA1|SHA256|SHA384|SHA512) \((.+)\) = ([0-9a-fA-F]+)\s*$/);
    if (bsd) { entries.push({ hash: bsd[3].toLowerCase(), path: bsd[2] }); return; }
    let rest = line;
    const escaped = rest.startsWith('\\');
    if (escaped) rest = rest.slice(1);
    const gnu = rest.match(/^([0-9a-fA-F]{32,128}) [ *](.+)$/);
    if (!gnu || ![32, 40, 64, 96, 128].includes(gnu[1].length)) { invalid.push(index + 1); return; }
    const path = escaped ? gnu[2].replace(/\\(\\|n|r)/g, (_, c) => (c === 'n' ? '\n' : c === 'r' ? '\r' : '\\')) : gnu[2];
    entries.push({ hash: gnu[1].toLowerCase(), path });
  });
  return { entries, invalid };
}

// ---------------------------------------------------------------------------
// Nomes dos arquivos do pacote

/** Remove caracteres que Windows, macOS e Linux não aceitam em nomes de arquivo. */
export function safeFileName(text) {
  return String(text ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
}

/** "Maria" ; "Maria e João" ; "Maria, João e Ana". */
export function joinNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} e ${list.at(-1)}`;
}

/**
 * Quantidade de arquivos dentro de um ZIP, no total e por extensão, da mais frequente
 * para a menos frequente: { total: '395 arquivos', extensoes: ['250 arquivos *.mp4', ...] }.
 */
export function describeZipContents(entries) {
  const plural = (n) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'arquivo' : 'arquivos'}`;
  const counts = new Map();
  for (const e of entries) {
    const nome = String(e.path).split('/').pop();
    const ext = /\.([^.]+)$/.exec(nome)?.[1]?.toLowerCase();
    const chave = ext ? `*.${ext}` : 'sem extensão';
    counts.set(chave, (counts.get(chave) ?? 0) + 1);
  }
  const extensoes = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${plural(n)} ${k}`);
  return { total: plural(entries.length), extensoes };
}

/** Resultado da comparação de um print com a conversa exportada, por extenso. */
export function resultadoComparacao(situacao) {
  return {
    encontrado: 'MENSAGEM ENCONTRADA na conversa exportada',
    'parcialmente encontrado': 'PARCIALMENTE ENCONTRADA: parte das mensagens não consta da conversa exportada',
    'não encontrado': 'MENSAGEM NÃO ENCONTRADA na conversa exportada',
    'não solicitada': 'comparação não realizada: o operador não descreveu a mensagem deste print',
    'sem conversa em texto para comparar': 'comparação não realizada: não há texto de conversa exportada entre os arquivos',
  }[situacao] ?? situacao;
}

/** Nome do pacote: "Relatório Hash_nome dos interlocutores" (ou o número do relatório). */
export function packageBaseName(id, interlocutores = []) {
  const names = interlocutores.map((it) => safeFileName(it.nome)).filter(Boolean);
  let joined = joinNames(names);
  // Limite de tamanho para caber no nome de arquivo de qualquer sistema.
  for (let n = names.length - 1; joined.length > 150 && n >= 1; n--) joined = `${names.slice(0, n).join(', ')} e outros`;
  if (joined.length > 150) joined = `${joined.slice(0, 140).trim()} e outros`;
  return `Relatório Hash_${joined || id}`;
}

export function packageNames(id, interlocutores = []) {
  const base = packageBaseName(id, interlocutores);
  return {
    pasta: base,
    zipName: `${base}.zip`,
    pdf: `Relatório_${id}.pdf`,
    txt: `Relatório_${id}.txt`,
    json: `relatorio_${id}.json`,
    sha256: `arquivos_${id}.sha256`,
    sha512: `arquivos_${id}.sha512`,
    sha3_512: `arquivos_${id}.sha3-512`,
    ambiente: `ambiente_${id}.json`,
    zip: `conteudo-zip_${id}.sha256`,
    prints: `prints_${id}.sha256`,
    conversa: `Conversa integral_${id}.pdf`,
    pacote: `pacote_${id}.sha256`,
    verificador: `Verificar integridade_${id}.html`,
    scriptSh: 'verificar.sh',
    scriptPs1: 'verificar.ps1',
    scriptBat: 'verificar.bat',
  };
}

// ---------------------------------------------------------------------------
// Blocos de conteúdo do relatório, no formato de relatório técnico de preservação de prova
// digital: capa, introdução, certificação (assinatura, hash master e validador), detalhes do
// registro (datas em hora local e UTC, ambiente, arquivos com SHA-256, SHA-512 e SHA3-512),
// prints em página inteira, vídeos, metadados técnicos, dados do caso, explicações e validação.
//
// Tipos: cover, pagebreak, section, h2, lead, p, band, bandRow, files, master, certification,
// printPage, table, kv, hash, code, sign, space, footnote.

/** "dd/mm/aaaa hh:mm:ss" no fuso indicado. */
export const fmtLocal = (iso, tz) => (iso ? formatDateTime(iso, tz).replace(' às', '') : 'não informado');
/** "dd/mm/aaaa hh:mm:ss UTC". */
export const fmtUtc = (iso) => (iso ? `${formatDateTime(iso, 'UTC').replace(' às', '')} UTC` : '');

/** Duração por extenso curto: "12m 38s", "1h 02m 05s", "4s". */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

/** Duração de vídeo no formato hh:mm:ss. */
export function formatClock(seconds) {
  const t = Math.round(Number(seconds) || 0);
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
}

/** Sistema operacional e navegador, a partir da identificação do navegador. */
export function describeEnvironment(ua = '', platform = '') {
  const so = /Windows NT 10/.test(ua) ? 'Windows 10 ou 11' : /Windows/.test(ua) ? 'Windows'
    : /iPhone|iPad/.test(ua) ? 'iOS ou iPadOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
      : /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : platform || 'sistema não identificado';
  let m;
  const nav = (m = /Edg\/(\d+)/.exec(ua)) ? `Microsoft Edge ${m[1]}`
    : (m = /OPR\/(\d+)/.exec(ua)) ? `Opera ${m[1]}`
      : (m = /Firefox\/(\d+)/.exec(ua)) ? `Mozilla Firefox ${m[1]}`
        : (m = /Chrome\/(\d+)/.exec(ua)) ? `Google Chrome ${m[1]}`
          : (m = /Version\/(\d+(?:\.\d+)?).*Safari/.exec(ua)) ? `Safari ${m[1]}`
            : 'navegador não identificado';
  return `${so} - ${nav}`;
}

const ALGO_ROTULO = { sha256: 'SHA-256', sha512: 'SHA-512', sha3_512: 'SHA3-512' };
/** Pares [rótulo, hash] dos algoritmos presentes no registro. */
const hashesOf = (rec) => Object.keys(ALGO_ROTULO).filter((a) => rec?.[a]).map((a) => [ALGO_ROTULO[a], rec[a]]);
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const nomeArquivo = (path) => String(path).split('/').pop();

export function buildBlocks(data, { jsonSha256 }) {
  const b = [];
  const tz = data.momento.fuso;
  const names = packageNames(data.id, data.caso.interlocutores ?? []);
  const op = data.operador;
  const caso = data.caso;
  const ass = data.assinatura ?? null;
  const zipFiles = data.arquivos.filter((f) => f.zipEntries?.length);
  const innerCount = zipFiles.reduce((n, f) => n + f.zipEntries.length, 0);
  const prints = data.prints ?? [];
  const link = validadorLink(data.id, jsonSha256);
  let section = 0;
  let sub = 0;
  const h1 = (text, { novaPagina = false } = {}) => { if (novaPagina) b.push({ type: 'pagebreak' }); sub = 0; b.push({ type: 'section', text: `${++section}. ${text}` }); };
  const h2 = (text) => b.push({ type: 'h2', text: `${section}.${++sub} ${text}` });
  const kv = (label, value) => b.push({ type: 'kv', label, value: String(value ?? 'não informado') });
  const p = (text) => b.push({ type: 'p', text });
  const lead = (text) => b.push({ type: 'lead', text });
  const band = (label, value, extra = {}) => b.push({ type: 'band', label, value: String(value ?? 'não informado'), ...extra });
  const code = (...lines) => b.push({ type: 'code', lines });

  // -------------------------------------------------------------------------
  // Capa
  b.push({
    type: 'cover',
    faixa: ass ? 'Relatório assinado digitalmente' : 'Relatório técnico',
    titulo: ['Integridade de conversa', 'eletrônica exportada'],
    identificador: data.id,
    tituloRegistro: data.titulo,
    responsavel: {
      tipo: 'PESSOA FÍSICA',
      linha: `${op.nome} / CPF ${op.cpf}`,
      extras: [
        ...(op.oab ? [op.oab] : []),
        ...(op.escritorio?.nome ? [`${op.escritorio.nome}${op.escritorio.documento ? ` / ${/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(op.escritorio.documento) ? 'CNPJ' : 'CPF'} ${op.escritorio.documento}` : ''}`] : []),
      ],
    },
    emissao: `Emitido em ${fmtLocal(data.momento.fim, tz)} (${data.momento.offset}) - ${APP.rotulo}`,
  });

  // -------------------------------------------------------------------------
  // Introdução
  b.push({ type: 'pagebreak' });
  b.push({ type: 'section', text: 'Introdução' });
  p(`O TalkEncript é uma ferramenta de preservação de prova digital que registra a integridade de conversas exportadas do WhatsApp, do Telegram e de outros aplicativos de mensagem. O operador exporta a conversa pela função do próprio aplicativo e apresenta os arquivos ao TalkEncript, que calcula, no navegador do computador do operador, a impressão digital criptográfica (código hash) de cada arquivo, de cada foto, áudio, vídeo e documento contido na exportação e de cada print juntado, e registra quem fez o procedimento, quando, onde e com qual ferramenta.`);
  p(`O método segue as diretrizes da ABNT NBR ISO/IEC 27037:2013 para identificação, coleta, aquisição e preservação de evidência digital e documenta a cadeia de custódia nos termos dos arts. 158-A a 158-F do Código de Processo Penal. Cada arquivo é identificado por três códigos hash de famílias diferentes (SHA-256, SHA-512 e SHA3-512): a alteração de um único caractere, pixel ou segundo de áudio produz códigos completamente diferentes. Os arquivos da conversa não são enviados pela internet nem armazenados em servidor.`);
  p(`Com isso, o relatório permite demonstrar que os arquivos apresentados em juízo são idênticos aos examinados no momento da geração (integridade), quando e por quem o exame foi feito (anterioridade e autoria do registro) e de onde vieram, segundo a declaração do operador (origem). ${ass ? 'O relatório foi assinado digitalmente pelo operador com certificado digital, o que protege o próprio documento contra alterações.' : 'Recomenda-se assinar digitalmente este relatório com certificado ICP-Brasil, para proteger o próprio documento contra alterações.'}`);
  p('O relatório não atesta, por si só, a autoria das mensagens nem que a exportação reproduz todas as mensagens existentes no aparelho: a confiança na origem dos dados, a completude da exportação e a coerência dos fatos alegados devem ser avaliadas em cada caso. A aceitação como prova depende do contexto e do convencimento do juízo, e pode ser complementada por ata notarial (art. 384 do CPC) ou perícia.');
  p(`O resultado é composto por este relatório e por arquivos que o acompanham no pacote ${names.zipName}: a transcrição integral da conversa, os prints reunidos em PDF, os metadados técnicos, os manifestos de hash e os verificadores. Recomenda-se que quem receber o relatório confira a sua integridade e a dos arquivos, pelos meios explicados na seção Validação do registro.`);

  // -------------------------------------------------------------------------
  // Certificação
  b.push({ type: 'pagebreak' });
  b.push({
    type: 'certification',
    assinatura: ass,
    master: data.arquivos.filter((f) => f.sha256).map((f) => ({ nome: f.path, hash: f.sha256 })),
    validador: { link, base: VALIDADOR_URL },
    codigo: jsonSha256,
    arquivoJson: names.json,
  });

  // -------------------------------------------------------------------------
  // 1. Detalhes do registro
  b.push({ type: 'pagebreak' });
  h1('Detalhes do registro');
  band('Identificador', data.id, { big: true });
  b.push({
    type: 'bandRow',
    cols: [
      { label: 'Iniciado em', value: fmtLocal(data.momento.inicio, tz), sub: fmtUtc(data.momento.inicio) },
      { label: 'Finalizado em', value: fmtLocal(data.momento.fim, tz), sub: fmtUtc(data.momento.fim) },
      { label: 'Tempo de sessão', value: formatDuration(new Date(data.momento.fim) - new Date(data.momento.inicio)) },
    ],
  });
  band('Fuso horário do dispositivo (zona GMT)', `(${data.momento.offset}) ${tz}`);
  band('Ambiente', `${describeEnvironment(data.ambiente.navegador, data.ambiente.plataforma)} - ${APP.rotulo} - processamento local, no navegador`);
  const geo = data.geolocalizacao;
  if (geo?.latitude != null) {
    band('Local da geração', `${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)} (raio de ${Math.round(geo.precisao)} m)${data.endereco?.enderecoCompleto ? ` - ${data.endereco.enderecoCompleto}` : ''}`);
  }
  b.push({
    type: 'files',
    label: 'Arquivos analisados (conversa exportada)',
    items: data.arquivos.map((f) => ({
      nome: f.path,
      detalhe: formatBytes(f.size).replace(/ \(.*\)$/, ''),
      descricao: `Conversa exportada do ${caso.plataforma}${f.zipEntries?.length ? ` (${plural(f.zipEntries.length, 'item', 'itens')})` : ''}`,
      hashes: hashesOf(f),
    })),
  });
  const gerados = [
    ...(data.transcricao ? [{ nome: data.transcricao.arquivo, detalhe: formatBytes(data.transcricao.tamanho ?? 0).replace(/ \(.*\)$/, ''), descricao: 'Transcrição integral da conversa', hashes: hashesOf(data.transcricao) }] : []),
    ...(data.printsPdf?.partes ?? []).map((pt) => ({ nome: pt.arquivo, detalhe: formatBytes(pt.tamanho).replace(/ \(.*\)$/, ''), descricao: 'Prints reunidos para juntada aos autos', hashes: hashesOf(pt) })),
    ...(data.metadados ?? []).map((m) => ({ nome: m.arquivo, detalhe: formatBytes(m.tamanho).replace(/ \(.*\)$/, ''), descricao: m.descricao, hashes: hashesOf(m) })),
  ];
  if (gerados.length) b.push({ type: 'files', label: 'Arquivos gerados', items: gerados });

  // 1.1 Prints
  h2('Imagens de tela (prints)');
  if (!prints.length) {
    lead('Nenhum print foi juntado a este relatório. A integridade da conversa é demonstrada pelos códigos hash dos arquivos exportados.');
  } else {
    lead(`Seguem os prints juntados pelo operador (${prints.length}), cada um em uma página, com a comparação da mensagem nele descrita com o texto da conversa exportada${data.printsPdf?.partes?.length ? `. Para juntada aos autos, os prints também foram reunidos em ${data.printsPdf.partes.map((pt) => pt.arquivo).join(', ')}` : ''}.`);
    if (prints.length) lead('(próxima página)');
    prints.forEach((f, i) => {
      const c = f.comparacao ?? { situacao: 'não solicitada', partes: [] };
      const linhas = [];
      const varias = c.partes.length > 1;
      c.partes.forEach((parte, k) => {
        linhas.push({ label: varias ? `Mensagem ${k + 1} descrita no print` : 'Mensagem descrita no print', segments: [{ text: `"${parte.trecho}"`, bold: true }] });
        if (parte.ocorrencias.length) {
          for (const o of parte.ocorrencias) {
            const [ini, fim] = o.destaque ?? [0, 0];
            linhas.push({
              label: `Encontrada na linha ${o.linha} da conversa exportada`,
              segments: [
                { text: o.conteudo.slice(0, ini) },
                { text: o.conteudo.slice(ini, fim), bold: true },
                { text: `${o.conteudo.slice(fim)} (${o.arquivo})` },
              ].filter((sg) => sg.text),
            });
          }
        } else {
          linhas.push({ label: varias ? `Mensagem ${k + 1}` : 'Mensagem', segments: [{ text: 'não encontrada no texto da conversa exportada' }] });
        }
      });
      linhas.push({ label: 'Resultado da comparação', segments: [{ text: resultadoComparacao(c.situacao), bold: c.situacao === 'encontrado' || c.situacao === 'não encontrado' }] });
      if (f.arquivosIdenticos?.length) linhas.push({ label: 'Imagem idêntica na conversa', segments: [{ text: `o print tem o mesmo SHA-256 de ${f.arquivosIdenticos.join('; ')}` }] });
      b.push({
        type: 'printPage',
        indice: i + 1,
        total: prints.length,
        arquivo: f.path,
        tamanho: formatBytes(f.size).replace(/ \(.*\)$/, ''),
        registrado: `${fmtLocal(f.fimCalculo, tz)} / ${fmtUtc(f.fimCalculo)}`,
        hashes: hashesOf(f),
        origem: `print juntado pelo operador (${caso.plataforma}); ${f.largura ? `${f.largura} x ${f.altura} pixels` : f.paginas ? `PDF com ${plural(f.paginas, 'página', 'páginas')}` : 'formato não identificado'}; última modificação ${fmtLocal(f.lastModified, tz)}`,
        dataUrl: f.imagem ?? f.miniatura ?? null,
        width: f.imagemLargura ?? f.miniaturaLargura,
        height: f.imagemAltura ?? f.miniaturaAltura,
        semImagem: f.paginas ? `Print em PDF (${plural(f.paginas, 'página', 'páginas')}), reproduzido no documento de prints que acompanha este relatório.` : 'Imagem não reproduzida (formato não suportado pelo navegador).',
        linhas,
      });
    });
  }

  // 1.2 Vídeos
  const videos = [
    ...data.arquivos.filter((f) => isVideoFile(f.path)).map((f) => ({ path: f.path, rec: f, data: fmtLocal(f.lastModified, tz) })),
    ...zipFiles.flatMap((f) => f.zipEntries.filter((e) => isVideoFile(e.path)).map((e) => ({ path: `${nomeArquivo(f.path)} > ${e.path}`, rec: e, data: e.modified ?? 'não informada' }))),
  ];
  h2('Vídeos contidos na conversa exportada');
  if (!videos.length) {
    lead('A conversa exportada não contém arquivos de vídeo.');
  } else {
    lead(`Seguem os vídeos encontrados na conversa exportada (${videos.length}), com a duração e a data de criação gravadas no próprio arquivo de vídeo:`);
    b.push({
      type: 'table',
      columns: [{ title: 'Arquivo', width: 0.5 }, { title: 'Data no arquivo exportado', width: 0.17 }, { title: 'Criado em (no vídeo)', width: 0.18 }, { title: 'Duração (hh:mm:ss)', width: 0.15 }],
      rows: videos.map((v) => [
        { title: `${v.path} - ${formatBytes(v.rec.size).replace(/ \(.*\)$/, '')}`, hashes: hashesOf(v.rec) },
        { text: v.data },
        { text: v.rec.video?.criadoEm ? fmtLocal(v.rec.video.criadoEm, tz) : 'não informado', small: v.rec.video?.criadoEm ? fmtUtc(v.rec.video.criadoEm) : '' },
        { text: v.rec.video ? formatClock(v.rec.video.duracaoSegundos) : 'não lida' },
      ]),
    });
  }

  // 1.3 Metadados técnicos
  h2('Metadados técnicos');
  lead('Arquivos de metadados técnicos gerados durante a sessão:');
  b.push({
    type: 'table',
    columns: [{ title: 'Data/hora', width: 0.2 }, { title: 'Arquivo', width: 0.5 }, { title: 'Tamanho', width: 0.12 }, { title: 'Descrição', width: 0.18 }],
    rows: (data.metadados ?? []).map((m) => [
      { text: fmtLocal(m.momento, tz), small: fmtUtc(m.momento) },
      { title: m.arquivo, hashes: hashesOf(m) },
      { text: formatBytes(m.tamanho).replace(/ \(.*\)$/, '') },
      { text: m.descricao },
    ]),
  });

  // 1.4 Conteúdo interno dos ZIPs
  if (innerCount) {
    h2('Conteúdo interno dos arquivos ZIP');
    lead('A exportação "com mídia" gera um ZIP com o texto da conversa e cada foto, vídeo, áudio ou documento. Além dos códigos do ZIP completo, foram calculados os de cada item, o que permite comprovar a integridade de uma mídia específica mesmo depois de extraída. O CRC-32 gravado no ZIP também foi conferido em cada item.');
    for (const f of zipFiles) {
      b.push({
        type: 'files',
        label: `${f.path} (${plural(f.zipEntries.length, 'item', 'itens')})`,
        items: f.zipEntries.map((e) => ({
          nome: e.path,
          detalhe: formatBytes(e.size).replace(/ \(.*\)$/, ''),
          descricao: [e.modified ? `data no ZIP ${e.modified}` : '', e.error ? e.crc32 : `CRC-32 ${e.crc32} ${e.crcOk ? 'conferido' : 'DIVERGENTE'}`, e.error ?? ''].filter(Boolean).join('; '),
          hashes: hashesOf(e),
        })),
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. Operador
  h1('Operador responsável');
  kv('Nome completo', op.nome);
  kv('CPF', op.cpf);
  kv('Endereço eletrônico', op.email);
  kv('Celular', op.celular);
  kv('Profissão', op.profissao || (op.oab ? 'Advogado(a)' : 'não informada'));
  if (op.oab) kv('Inscrição na OAB', op.oab);
  if (op.escritorio?.nome) kv('Escritório ou empresa', op.escritorio.nome);
  if (op.escritorio?.endereco) kv('Endereço do escritório ou empresa', op.escritorio.endereco);
  if (op.escritorio?.documento) kv('CNPJ/CPF do escritório ou empresa', op.escritorio.documento);
  (op.links ?? []).forEach((l, i) => kv(`Link ${i + 1}: ${l.titulo}`, l.url));
  kv('Finalidade informada pelo operador', caso.finalidade || 'não informada');
  p(`Declaração do operador, aceita em ${formatDateTime(data.declaracao.aceitaEm, tz)}: "${data.declaracao.texto}"`);

  // 3. Conversa
  h1('Identificação da conversa');
  kv('Aplicativo', caso.plataforma);
  kv('Tipo de exportação', caso.tipoExportacao);
  kv('Data da conversa', caso.dataConversaInicio
    ? (caso.dataConversaFim ? `de ${formatDateOnly(caso.dataConversaInicio)} a ${formatDateOnly(caso.dataConversaFim)}` : formatDateOnly(caso.dataConversaInicio))
    : 'não informada');
  const speakers = caso.interlocutores ?? [];
  if (speakers.length) {
    speakers.forEach((it, i) => {
      kv(`Interlocutor ${i + 1}`, it.nome || 'nome não informado');
      if (it.qualificacao) kv('Qualificação no caso', it.qualificacao);
      kv('Telefone', it.telefone || 'não informado');
    });
    if (caso.relacaoInterlocutores) kv('Relação entre os interlocutores', caso.relacaoInterlocutores);
  } else {
    kv('Interlocutores', caso.descricao || 'não informados');
  }
  kv(`Versão do ${caso.plataforma}`, caso.versaoAplicativo || 'não informada');
  kv('Modelo do aparelho ou conta de origem', caso.origem || 'não informado');
  kv('IMEI do aparelho', caso.imei ? `${caso.imei} (exibidos apenas os 4 primeiros e os 3 últimos dígitos, por segurança do aparelho)` : caso.imeiNaoSeAplica ? 'não se aplica (exportação pelo computador ou aparelho sem IMEI)' : 'não informado');
  kv('Data da exportação informada', caso.dataExportacao ? formatDateOnly(caso.dataExportacao) : 'não informada');
  kv('Processo ou referência', caso.processo || 'não informado');
  if (caso.observacoes) kv('Observações', caso.observacoes);
  for (const c of data.conversas ?? []) {
    b.push({ type: 'h2', text: `Resumo de ${c.arquivo} (informativo)` });
    kv('Plataforma reconhecida', c.plataforma);
    if (c.nomeDaConversa) kv('Nome da conversa', c.nomeDaConversa);
    kv('Mensagens identificadas', c.mensagens);
    if (c.anexosReferidos != null) kv('Mídias ou anexos referidos', c.anexosReferidos);
    kv('Primeira mensagem', c.primeiraMensagem ?? 'não identificada');
    kv('Última mensagem', c.ultimaMensagem ?? 'não identificada');
    kv('Participantes', c.participantes.slice(0, 30).map((x) => `${x.nome} (${x.mensagens})`).join('; ') + (c.participantes.length > 30 ? `; e mais ${c.participantes.length - 30}` : ''));
  }
  const tr = data.transcricao;
  b.push({ type: 'h2', text: 'Transcrição integral' });
  if (tr) {
    p(`O arquivo ${tr.arquivo}, que acompanha este relatório, reproduz integralmente, linha a linha, o texto da conversa exportada (${plural(tr.linhas, 'linha', 'linhas')} em ${plural(tr.paginas, 'página', 'páginas')}), com a numeração das linhas usada na comparação dos prints. O arquivo de texto original, identificado pelos códigos hash, continua sendo a referência exata do conteúdo. ${tr.caracteresRepresentadosPorCodigo} caractere(s) sem desenho na fonte do PDF (como emojis) foram representados pelo código Unicode entre colchetes e ${tr.caracteresInvisiveisOmitidos} caractere(s) invisível(is) de formatação foram omitidos.`);
  } else {
    p('Não foi identificado arquivo de texto (.txt) de conversa exportada entre os arquivos; por isso, não foi gerada a transcrição integral em PDF.');
  }

  // 4. Data, hora e localização
  h1('Data, hora e localização da geração');
  kv('Início do procedimento', `${fmtLocal(data.momento.inicio, tz)} (${fmtUtc(data.momento.inicio)})`);
  kv('Conclusão do procedimento', `${fmtLocal(data.momento.fim, tz)} (${fmtUtc(data.momento.fim)})`);
  kv('Data e hora em UTC (ISO 8601)', data.momento.fim);
  kv('Fuso horário do dispositivo', `${tz} (${data.momento.offset})`);
  if (data.momento.horaServidor) {
    const s = data.momento.horaServidor;
    kv('Hora de referência do servidor', `${formatDateTime(s.data, tz)} (${s.origem}); diferença em relação ao relógio do dispositivo: ${s.diferencaSegundos} segundo(s)`);
  } else {
    kv('Hora de referência do servidor', `indisponível (${data.momento.horaServidorMotivo ?? 'sem conexão ou servidor sem cabeçalho Date'})`);
  }
  if (geo?.latitude != null) {
    kv('Latitude', geo.latitude.toFixed(6));
    kv('Longitude', geo.longitude.toFixed(6));
    kv('Precisão estimada', `${Math.round(geo.precisao)} metros`);
    if (geo.altitude != null) kv('Altitude', `${Math.round(geo.altitude)} metros`);
    kv('Momento da leitura', formatDateTime(geo.momento, tz));
    kv('Fonte', 'API de Geolocalização do navegador (GPS, Wi-Fi ou rede, conforme o dispositivo), com autorização do operador');
    kv('Localização no Google Maps', googleMapsUrl(geo.latitude, geo.longitude));
    kv('Localização no OpenStreetMap', `https://www.openstreetmap.org/?mlat=${geo.latitude.toFixed(6)}&mlon=${geo.longitude.toFixed(6)}#map=17/${geo.latitude.toFixed(6)}/${geo.longitude.toFixed(6)}`);
    const end = data.endereco;
    b.push({ type: 'h2', text: 'Endereço por extenso (aproximado)' });
    if (end && !end.motivo) {
      const na = 'não identificado';
      kv('Tipo de logradouro', end.tipoLogradouro ?? na);
      kv('Logradouro', end.logradouro ?? na);
      kv('Número do imóvel', end.numero ?? 'não identificado na base cartográfica');
      kv('Raio de localização', `${Math.round(geo.precisao)} metros (precisão informada pelo dispositivo); números próximos pesquisados em raio de ${end.raio} metros`);
      kv('Números de imóveis próximos', end.numerosProximos?.length
        ? end.numerosProximos.map((n) => `nº ${n.numero}${n.logradouro ? `, ${n.logradouro}` : ''} (a ${n.distancia} m)`).join('; ')
        : end.numerosMotivo ?? 'não disponíveis');
      kv('CEP', end.cep ?? na);
      kv('Bairro', end.bairro ?? na);
      kv('Cidade', end.cidade ?? na);
      kv('Estado', end.estado ?? na);
      kv('País', end.pais ?? na);
      if (end.enderecoCompleto) kv('Endereço completo', end.enderecoCompleto);
      kv('Fonte e momento da consulta', `${end.fonte}, em ${formatDateTime(end.consultadoEm, tz)}`);
      p(`O endereço é aproximado: foi obtido a partir das coordenadas e pode divergir do endereço real dentro do raio de localização. ${end.atribuicao}`);
    } else {
      kv('Endereço por extenso', end ? `não obtido (${end.motivo})` : 'não solicitado pelo operador');
      kv('Raio de localização', `${Math.round(geo.precisao)} metros (precisão informada pelo dispositivo)`);
    }
  } else {
    kv('Geolocalização', `não obtida (${geo?.motivo ?? 'não solicitada'})`);
  }
  if (data.localInformado) kv('Local informado pelo operador', data.localInformado);

  // 5. Cadeia de custódia
  h1('Registro cronológico da cadeia de custódia');
  lead('Quem praticou cada ato, com qual ferramenta e em que momento (arts. 158-A a 158-F do Código de Processo Penal e ABNT NBR ISO/IEC 27037:2013):');
  b.push({
    type: 'table',
    columns: [{ title: 'Data/hora', width: 0.24 }, { title: 'Ato', width: 0.76 }],
    rows: data.eventos.map((ev) => [{ text: fmtLocal(ev.momento, tz), small: fmtUtc(ev.momento) }, { text: ev.descricao }]),
  });

  // -------------------------------------------------------------------------
  // 6. Sobre o TalkEncript
  h1('Sobre o TalkEncript');
  p('O TalkEncript é um aplicativo de arquivo único que funciona no navegador do próprio operador, sem instalação de servidor e sem envio dos arquivos da conversa pela internet. Ele organiza, em um procedimento padronizado, a identificação dos arquivos exportados, o cálculo dos códigos hash, o registro de data, hora e localização e a documentação de cada ato, de modo que qualquer pessoa possa reproduzir a conferência com ferramentas gratuitas de qualquer sistema operacional.');
  h2('O ambiente de geração');
  p(`Todo o processamento ocorre no navegador do operador (${describeEnvironment(data.ambiente.navegador, data.ambiente.plataforma)}). Os arquivos são lidos diretamente do disco, em blocos, e os códigos hash são calculados em uma área separada do navegador (Web Worker), sem modificar os arquivos. A única comunicação externa é a consulta opcional do endereço por extenso, que envia apenas as coordenadas ao serviço de mapas. O código da ferramenta tem o seu próprio SHA-256 registrado neste relatório, para auditoria de que a versão utilizada é a publicada.`);
  p('Diferentemente de uma captura feita em ambiente isolado no servidor de terceiros, o TalkEncript não controla o computador do operador: a confiança no registro decorre da exportação feita pela função do próprio aplicativo de mensagens, da declaração do operador, da documentação da cadeia de custódia e da possibilidade de qualquer interessado recalcular os códigos hash e compará-los com os aqui registrados.');
  h2('Conteúdos registrados');
  p('Arquivos da conversa exportada: o arquivo exportado (ZIP, TXT, JSON ou HTML) e, quando a exportação é com mídia, cada foto, áudio, vídeo e documento contido no ZIP. Prints: capturas de tela juntadas pelo operador, reproduzidas em página inteira e comparadas com o texto da conversa. Vídeos: identificados com a duração e a data de criação gravadas no próprio arquivo. Metadados técnicos: dados do ambiente de geração reunidos em arquivo próprio, também identificado por códigos hash.');
  h2('Integridade pelos códigos hash');
  p('O código hash é o resultado de uma função criptográfica que transforma o conteúdo de um arquivo em uma sequência de tamanho fixo. A mesma entrada produz sempre o mesmo código, e qualquer alteração, por menor que seja, produz um código completamente diferente; não é possível reconstruir o conteúdo a partir do código. Por isso, basta recalcular o hash do arquivo apresentado e compará-lo com o registrado: se forem iguais, o arquivo é idêntico.');
  for (const a of data.algoritmos) {
    kv(a.nome, `${a.bits} bits (${a.bits / 4} caracteres hexadecimais); ${a.nome === 'SHA3-512' ? 'família SHA-3, norma FIPS 202 do NIST' : 'família SHA-2, norma FIPS 180-4 do NIST'}`);
  }
  if (innerCount) kv('CRC-32', 'código de 32 bits gravado no próprio ZIP, conferido para cada item; atesta apenas que o ZIP não está corrompido');
  p('Algoritmos antigos, como o MD5 e o SHA-1, não são mais recomendados para integridade. Não há falha conhecida no SHA-256, no SHA-512 ou no SHA3-512; o uso combinado de algoritmos de famílias diferentes (SHA-2 e SHA-3) acrescenta segurança, porque uma eventual fraude teria de enganar construções matemáticas distintas ao mesmo tempo. A função hash não usa chave secreta.');
  h2('O relatório em PDF');
  p(`O relatório é gerado no próprio navegador, logo após o cálculo dos códigos, em PDF com fontes embutidas. Todos os seus dados constam também do arquivo ${names.json}, cujo SHA-256 é o código de verificação impresso no rodapé de cada página e no QR code: alterar qualquer dado do registro altera esse código.`);
  h2('Assinatura digital');
  if (ass) {
    p(`Este relatório foi assinado digitalmente por ${ass.titular}${ass.cpf ? `, CPF ${ass.cpf}` : ''}${ass.cnpj ? `, CNPJ ${ass.cnpj}` : ''}, com certificado digital do tipo ${ass.tipo} A1 emitido por ${ass.emissor}${ass.icpBrasil ? ', na cadeia da Infraestrutura de Chaves Públicas Brasileira (ICP-Brasil)' : ''}, número de série ${ass.numeroSerie}, válido até ${fmtLocal(ass.validoAte, tz)}. A assinatura segue o padrão PAdES (ETSI EN 319 142-1), com resumo SHA-256 e chave RSA, e foi feita no computador do operador, sem envio do certificado ou da senha.`);
    p('A assinatura abrange todo o conteúdo do PDF: qualquer alteração posterior, mesmo mínima, é apontada pelos leitores de PDF e pelo verificador de conformidade do ITI. A assinatura qualificada com certificado ICP-Brasil tem presunção de veracidade em relação ao signatário (art. 10, § 1º, da Medida Provisória nº 2.200-2/2001) e é meio idôneo de autenticação de documentos (art. 411, II, do CPC). A data e a hora da assinatura são as do relógio do computador do operador; esta emissão não contém carimbo do tempo de Autoridade de Carimbo do Tempo.');
  } else {
    p('Esta emissão não foi assinada digitalmente no TalkEncript. A integridade do relatório pode ser demonstrada pelo código de verificação e pelo pacote; para proteger o próprio documento, recomenda-se assiná-lo com certificado ICP-Brasil (art. 10, § 1º, da Medida Provisória nº 2.200-2/2001 e art. 411, II, do CPC), no próprio TalkEncript (certificado A1) ou no assinador que o operador já utiliza, no padrão PAdES.');
  }
  h2('Escopo e limitações');
  p('O objeto deste registro são os arquivos apresentados pelo operador, tal como exportados pelo aplicativo de mensagens. O relatório comprova a integridade desses arquivos a partir do momento da geração e documenta quem os apresentou, quando e onde. Não atesta, por si só, a autoria das mensagens, a identidade dos interlocutores nem que a exportação reproduz todas as mensagens existentes no aparelho. A data e a hora são as do relógio do dispositivo, acompanhadas da hora de referência do servidor quando disponível, e a geolocalização depende da autorização e da precisão do dispositivo.');
  p('Recomenda-se gerar o relatório logo após a exportação, preservar os arquivos originais e, se possível, o aparelho de origem, e, quando a relevância do caso justificar, complementar com ata notarial (art. 384 do CPC) ou perícia técnica.');
  h2('Fundamentação normativa e técnica');
  for (const n of NORMAS) p(n);
  h2('Ferramenta utilizada');
  kv('Aplicativo', `${APP.rotulo} (${APP.edicao})`);
  kv('Criador', `${APP.criador.nome}, ${APP.criador.qualificacao.toLowerCase()}, ${APP.criador.oab}`);
  kv('Endereço de execução', data.ambiente.endereco);
  kv('Navegador', data.ambiente.navegador);
  kv('Sistema', data.ambiente.plataforma);
  kv('Idioma e tela', `${data.ambiente.idioma}; ${data.ambiente.tela}`);
  kv('Bibliotecas', APP.bibliotecas.map((l) => `${l.nome} ${l.versao} (${l.licenca})`).join('; '));
  if (data.ferramenta.codigo?.length) {
    p('SHA-256 do código da ferramenta no momento da execução:');
    for (const c of data.ferramenta.codigo) b.push({ type: 'hash', label: c.arquivo, value: c.sha256 });
  }

  // -------------------------------------------------------------------------
  // 7. Validação do registro
  h1('Validação do registro');
  p('A validação consiste em conferir a integridade e a origem do relatório em PDF e a integridade dos arquivos da conversa, dos prints e dos demais arquivos do pacote, confirmando que nada foi alterado desde a geração. Para que a assinatura digital possa ser validada, o PDF não pode ter sido impresso, editado ou salvo novamente por outro programa; copiar o arquivo para outra pasta, pen drive ou serviço de armazenamento não afeta a validação, desde que o conteúdo não seja modificado. Novas assinaturas no padrão PAdES também não prejudicam a verificação.');
  h2('Validador online');
  p('Aponte a câmera do celular para o QR code da página de certificação, ou acesse o endereço abaixo, e arraste para a página o pacote do relatório e os arquivos da conversa. A conferência é feita no navegador de quem acessa: nenhum arquivo é enviado a servidor.');
  kv('Endereço deste relatório', link);
  kv('Página de verificação', VALIDADOR_URL);
  h2('Verificação pelo pacote, sem internet');
  p(`O pacote ${names.zipName} traz a página ${names.verificador}, que abre com dois cliques e faz a mesma conferência sem internet, e os verificadores verificar.sh (macOS e Linux, no Terminal: bash, um espaço e o arquivo arrastado para a janela) e verificar.bat (Windows, com dois cliques). Cada arquivo aparece como Íntegro, Alterado ou Não registrado.`);
  h2('Validação manual');
  b.push({ type: 'h3', text: 'Integridade e origem do relatório em PDF' });
  if (ass) {
    p('Acesse https://validar.iti.gov.br, envie o PDF original e confira se a assinatura está íntegra e pertence ao operador indicado. Leitores de PDF gratuitos, como o Adobe Acrobat Reader, também mostram a assinatura no painel de assinaturas, desde que a cadeia de certificados ICP-Brasil esteja instalada (instruções em https://www.gov.br/iti).');
  } else {
    p(`Esta emissão não tem assinatura digital. Confira o código de verificação: o SHA-256 do arquivo ${names.json} deve ser igual ao impresso no rodapé deste relatório.`);
  }
  b.push({ type: 'h3', text: 'Integridade dos arquivos' });
  const first = data.arquivos[0] ?? { path: 'conversa.zip' };
  const firstName = nomeArquivo(first.path);
  p(`Calcule o código hash do arquivo em sua posse e compare-o com o registrado neste relatório. Se forem iguais, o arquivo é idêntico. Exemplo com o arquivo ${firstName}: abra o terminal, digite o comando do seu sistema seguido de um espaço, arraste o arquivo para a janela e pressione Enter.`);
  code(
    `SHA-256  macOS:   shasum -a 256 ${shellQuote(firstName)}`,
    `         Linux:   sha256sum ${shellQuote(firstName)}`,
    `         Windows: Get-FileHash -Algorithm SHA256 ${psQuote(firstName)}`,
    `SHA-512  macOS:   shasum -a 512 ${shellQuote(firstName)}`,
    `         Linux:   sha512sum ${shellQuote(firstName)}`,
    `         Windows: Get-FileHash -Algorithm SHA512 ${psQuote(firstName)}`,
    `SHA3-512 macOS e Linux: openssl dgst -sha3-512 ${shellQuote(firstName)}`,
  );
  p(`Os valores esperados para ${firstName} são:`);
  for (const [alg, h] of hashesOf(first)) b.push({ type: 'hash', label: alg, value: h });
  p(`Para conferir todos os arquivos de uma vez, copie o manifesto de SHA-256 do pacote para a pasta dos arquivos da conversa, abra o terminal nessa pasta e execute o comando abaixo. Há manifestos equivalentes para o SHA-512, para o SHA3-512, para os itens dos ZIPs${prints.length ? ' e para os prints' : ''}. No Windows, use a página de verificação ou o verificar.bat.`);
  code(`macOS:  shasum -a 256 -c ${names.sha256}`, `Linux:  sha256sum -c ${names.sha256}`);
  b.push({ type: 'h3', text: 'Conteúdo do relatório' });
  p('Cabe a quem recebe o relatório avaliar a coerência do conteúdo registrado: se os arquivos correspondem à conversa alegada, se as datas e horas (também informadas em UTC) são compatíveis com os fatos, a confiança na origem das informações e se a exportação é suficiente para demonstrar o que se alega.');
  h2('Preservação do arquivo exportado');
  p(`O valor probatório depende de o arquivo exportado ser preservado exatamente como foi exportado. Guarde ${data.arquivos.length === 1 ? 'o arquivo' : 'os arquivos'} sem abrir para edição, descompactar e compactar de novo, converter ou salvar por cima; mantenha o nome original; faça ao menos duas cópias em mídias diferentes e confira o hash de cada cópia; transfira sempre como arquivo ou documento (nunca como foto, vídeo ou mensagem); preserve a conversa no aplicativo e, se possível, o aparelho; armazene as cópias com acesso restrito, registrando quem teve acesso e quando; e, ao juntar aos autos, apresente o arquivo original, este relatório e o pacote, informando na petição o hash master.`);

  b.push({ type: 'sign', lines: [op.nome, `CPF ${op.cpf}${op.oab ? `  |  ${op.oab}` : ''}`, ...(op.escritorio?.nome ? [op.escritorio.nome] : []), ass ? 'Operador responsável - assinado digitalmente' : 'Operador responsável'] });
  b.push({
    type: 'footnote',
    lines: [
      `Este registro foi gerado pelo ${APP.rotulo} (${APP.edicao}), criado por ${APP.criador.nome}, ${APP.criador.oab}.`,
      `Identificador: ${data.id}. Código de verificação (SHA-256 de ${names.json}): ${jsonSha256}.`,
      ...(data.metadados ?? []).map((m) => `Metadados: ${m.arquivo} (${m.tamanho.toLocaleString('pt-BR')} bytes), SHA-256 ${m.sha256}.`),
    ],
  });
  return b;
}

const isVideoFile = (path) => /\.(mp4|m4v|mov|3gp|3gpp)$/i.test(String(path));

export const NORMAS = [
  'Código de Processo Penal, arts. 158-A a 158-F, incluídos pela Lei nº 13.964/2019: definem a cadeia de custódia como o conjunto de procedimentos para manter e documentar a história cronológica do vestígio, desde o reconhecimento até o descarte, e exigem o registro de quem teve contato com ele.',
  'ABNT NBR ISO/IEC 27037:2013: diretrizes para identificação, coleta, aquisição e preservação de evidência digital, que recomendam o uso de função hash, ferramentas confiáveis e auditáveis e a documentação de cada etapa.',
  'Superior Tribunal de Justiça: no HC 1.036.370 (Rel. Min. Joel Ilan Paciornik, 2025), a Corte afastou prints de WhatsApp desacompanhados de protocolo de preservação, exigindo integridade comprovada por hash, auditabilidade, documentação da cadeia de custódia e métodos reprodutíveis conforme a ISO/IEC 27037; no AgRg no HC 1.014.212/ES (Rel. Min. Carlos Pires Brandão, Sexta Turma, julgado em 10/2/2026, Informativo 878), destacou a ausência de certificação de integridade (código hash) como causa de necessidade de perícia complementar.',
  'Conselho Nacional de Justiça: a Portaria da Presidência nº 391, de 4/11/2025, instituiu grupo de trabalho, presidido pelo Min. Joel Ilan Paciornik, para propor a regulamentação da cadeia de custódia da prova digital. A minuta de resolução em discussão prevê registro de quem teve acesso ao material, da ferramenta utilizada e do momento de cada procedimento, preservação de metadados e uso de hash. Até 1/10/2026, a resolução não havia sido aprovada em definitivo; este relatório adota os requisitos nela previstos.',
  'Medida Provisória nº 2.200-2/2001 (Infraestrutura de Chaves Públicas Brasileira, ICP-Brasil), art. 10, § 1º, e Lei nº 11.419/2006 (processo judicial eletrônico): conferem validade jurídica a documentos eletrônicos assinados digitalmente.',
  'Código de Processo Civil, art. 369 (admissão de todos os meios legais e moralmente legítimos de prova), art. 384 (ata notarial) e art. 411, II (autenticidade de documento com identificação do autor por certificação digital).',
  'Lei nº 13.709/2018 (LGPD): os dados do operador são tratados apenas para identificação do responsável no relatório e ficam armazenados somente no dispositivo do operador.',
  'NIST FIPS 180-4 (Secure Hash Standard), especificação do SHA-256 e do SHA-512; NIST FIPS 202 (SHA-3 Standard), especificação do SHA3-512; ETSI EN 319 142-1 (PAdES), padrão de assinatura digital em PDF.',
];

// ---------------------------------------------------------------------------
// Texto puro (UTF-8)

const hashLines = (hashes, indent = '    ') => hashes.map(([a, h]) => `${indent}HASH ${a}: ${h}`);

export function renderText(blocks) {
  const out = [];
  for (const bl of blocks) {
    switch (bl.type) {
      case 'cover':
        out.push(bl.faixa.toUpperCase(), '='.repeat(bl.faixa.length), bl.titulo.join(' '), '', `Identificador: ${bl.identificador}`, `Título: ${bl.tituloRegistro}`, `Responsável: ${bl.responsavel.tipo} - ${bl.responsavel.linha}`, ...bl.responsavel.extras.map((e) => `             ${e}`), bl.emissao, '');
        break;
      case 'certification':
        out.push('', 'CERTIFICAÇÃO', '------------');
        if (bl.assinatura) {
          const a = bl.assinatura;
          out.push(`Assinatura digital: ${a.titular}${a.cpf ? `, CPF ${a.cpf}` : ''}${a.cnpj ? `, CNPJ ${a.cnpj}` : ''}; certificado ${a.tipo} A1 emitido por ${a.emissor}, número de série ${a.numeroSerie}, válido até ${a.validoAte}. Padrão PAdES. A assinatura consta somente do relatório em PDF.`);
        } else {
          out.push('Assinatura digital: não assinado digitalmente nesta emissão.');
        }
        out.push('HASH MASTER (SHA-256 do arquivo analisado)', ...bl.master.map((it) => `${it.nome}: ${it.hash}`));
        out.push(`Validador online: ${bl.validador.link}`, `Código de verificação (SHA-256 de ${bl.arquivoJson}): ${bl.codigo}`, '');
        break;
      case 'pagebreak': break;
      case 'section': out.push('', '', bl.text.toUpperCase(), '-'.repeat(bl.text.length), ''); break;
      case 'h2': out.push('', bl.text); break;
      case 'h3': out.push('', bl.text); break;
      case 'lead': if (bl.text !== '(próxima página)') out.push(bl.text, ''); break;
      case 'p': out.push(bl.text, ''); break;
      case 'band': out.push(`${bl.label}: ${bl.value}${bl.sub ? ` (${bl.sub})` : ''}`); break;
      case 'bandRow': out.push(...bl.cols.map((c) => `${c.label}: ${c.value}${c.sub ? ` (${c.sub})` : ''}`)); break;
      case 'files':
        out.push('', `${bl.label}:`);
        for (const it of bl.items) out.push(`  ${it.nome} (${it.detalhe}) - ${it.descricao}`, ...hashLines(it.hashes));
        out.push('');
        break;
      case 'printPage':
        out.push('', `Print ${bl.indice} de ${bl.total}: ${bl.arquivo} - ${bl.tamanho} - Registrado em: ${bl.registrado}`, ...hashLines(bl.hashes, '  '), `  Origem: ${bl.origem}`, '  [Imagem reproduzida no relatório em PDF.]');
        for (const l of bl.linhas) out.push(`  ${l.label}: ${l.segments.map((sg) => sg.text).join('')}`);
        break;
      case 'table':
        out.push(bl.columns.map((c) => c.title).join(' | '));
        for (const row of bl.rows) {
          out.push(row.map((c) => [c.title ?? c.text, c.small].filter(Boolean).join(' ')).join(' | '));
          for (const c of row) if (c.hashes) out.push(...hashLines(c.hashes));
        }
        out.push('');
        break;
      case 'master': out.push('HASH MASTER (SHA-256 do arquivo analisado)', ...bl.items.map((it) => `${it.nome}: ${it.hash}`), ''); break;
      case 'kv': out.push(bl.label ? `${bl.label}: ${bl.value}` : `${' '.repeat(4)}${bl.value}`); break;
      case 'hash': out.push(`${bl.label}: ${bl.value}`); break;
      case 'code': out.push('', ...bl.lines.map((l) => `    ${l}`), ''); break;
      case 'space': out.push(''); break;
      case 'sign': out.push('', '', '', '______________________________________________', ...bl.lines); break;
      case 'footnote': out.push('', ...bl.lines); break;
      default: break;
    }
  }
  return out.join('\n') + '\n';
}
