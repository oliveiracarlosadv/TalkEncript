// Cálculo de hash em fluxo (sem carregar o arquivo inteiro na memória) e leitura de ZIP.
// Funciona no navegador (Web Worker) e no Node.js 20+, pois depende apenas de Blob.

import { createMD5, createSHA1, createSHA256, createSHA384, createSHA512, createSHA3, createCRC32 } from '../vendor/hash-wasm.esm.min.js';
import { Inflate } from '../vendor/fflate.esm.js';

export const CHUNK = 8 * 1024 * 1024;

export const ALGORITHMS = {
  md5: { label: 'MD5', bits: 128, create: createMD5 },
  sha1: { label: 'SHA-1', bits: 160, create: createSHA1 },
  sha256: { label: 'SHA-256', bits: 256, create: createSHA256 },
  sha384: { label: 'SHA-384', bits: 384, create: createSHA384 },
  sha512: { label: 'SHA-512', bits: 512, create: createSHA512 },
  // SHA3-512 (família SHA-3, norma FIPS 202): algoritmo de construção diferente da família
  // SHA-2, usado em conjunto com o SHA-512 para segurança adicional.
  sha3_512: { label: 'SHA3-512', bits: 512, create: () => createSHA3(512), norma: 'FIPS 202' },
};

/** Algoritmos usados no relatório: SHA-256, SHA-512 e SHA3-512. */
export const REPORT_ALGOS = ['sha256', 'sha512', 'sha3_512'];

/**
 * Identifica o algoritmo pelo tamanho do hash hexadecimal. Com 128 caracteres, o hash
 * pode ser SHA-512 ou SHA3-512: o resultado é sha512, e quem confere calcula os dois.
 */
export function detectAlgorithm(hex) {
  const clean = normalizeHex(hex);
  if (!/^[0-9a-f]+$/.test(clean)) return null;
  return Object.keys(ALGORITHMS).find((k) => ALGORITHMS[k].bits / 4 === clean.length) ?? null;
}

// ---------------------------------------------------------------------------
// Vídeos MP4/MOV: duração e data de criação lidas da caixa "mvhd" enquanto o arquivo
// passa pelo cálculo do hash, sem leitura adicional. A caixa pode estar no início ou no
// fim do arquivo e pode ser cortada entre dois blocos; por isso guarda-se o final do bloco.

export const isVideoName = (path) => /\.(mp4|m4v|mov|3gp|3gpp)$/i.test(String(path));

const MAC_EPOCH = Date.UTC(1904, 0, 1);

export function createVideoProbe() {
  let tail = new Uint8Array(0);
  let info = null;
  const scan = (bytes) => {
    for (let i = 4; i + 32 <= bytes.length; i++) {
      // "mvhd" precedido do tamanho da caixa (4 bytes).
      if (bytes[i] !== 0x6d || bytes[i + 1] !== 0x76 || bytes[i + 2] !== 0x68 || bytes[i + 3] !== 0x64) continue;
      const v = new DataView(bytes.buffer, bytes.byteOffset + i + 4);
      const version = v.getUint8(0);
      let created;
      let timescale;
      let duration;
      if (version === 1) {
        if (i + 4 + 32 > bytes.length) return;
        created = Number(v.getBigUint64(4));
        timescale = v.getUint32(20);
        duration = Number(v.getBigUint64(24));
      } else if (version === 0) {
        created = v.getUint32(4);
        timescale = v.getUint32(12);
        duration = v.getUint32(16);
      } else continue;
      if (!timescale || duration > timescale * 86400 * 7) continue;
      info = {
        duracaoSegundos: Math.round((duration / timescale) * 100) / 100,
        criadoEm: created > 0 ? new Date(MAC_EPOCH + created * 1000).toISOString() : null,
      };
      return;
    }
  };
  return {
    push(chunk) {
      if (info) return;
      const joined = new Uint8Array(tail.length + chunk.length);
      joined.set(tail);
      joined.set(chunk, tail.length);
      scan(joined);
      tail = joined.slice(Math.max(0, joined.length - 40));
    },
    result: () => info,
  };
}

/** Remove espaços e dois-pontos e converte para minúsculas (aceita a saída do certutil). */
export const normalizeHex = (text) => String(text ?? '').replace(/[\s:]+/g, '').toLowerCase();

async function createHashers(algos) {
  const list = [];
  for (const algo of algos) {
    const h = await ALGORITHMS[algo].create();
    h.init();
    list.push([algo, h]);
  }
  return list;
}

const finish = (hashers) => Object.fromEntries(hashers.map(([algo, h]) => [algo, h.digest('hex')]));

/** Hash de um Blob/File lido em blocos. `onBytes` recebe a quantidade lida em cada bloco. */
export async function hashBlob(blob, algos = REPORT_ALGOS, onBytes = () => {}, isCancelled = () => false, probe = null) {
  const hashers = await createHashers(algos);
  for (let offset = 0; offset < blob.size; offset += CHUNK) {
    if (isCancelled()) throw new Error('cancelado');
    const chunk = new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer());
    for (const [, h] of hashers) h.update(chunk);
    probe?.push(chunk);
    onBytes(chunk.length);
  }
  return finish(hashers);
}

export async function hashBytes(bytes, algos = ['sha256']) {
  const hashers = await createHashers(algos);
  for (const [, h] of hashers) h.update(bytes);
  return finish(hashers);
}

// ---------------------------------------------------------------------------
// Leitura de ZIP pelo diretório central (com suporte a ZIP64), com acesso
// aleatório ao arquivo. Cada item é descompactado em fluxo e tem seu hash
// calculado; o CRC-32 gravado no ZIP também é conferido.

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);
const u64 = (v, o) => Number(v.getBigUint64(o, true));

async function readRange(blob, start, end) {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

function decodeName(bytes, utf8Flag) {
  if (utf8Flag) return new TextDecoder('utf-8').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Sem a marca UTF-8, a especificação prevê CP437; latin1 é uma aproximação suficiente.
    return new TextDecoder('latin1').decode(bytes);
  }
}

function dosDate(date, time) {
  if (!date) return null;
  const y = ((date >> 9) & 0x7f) + 1980;
  const mo = (date >> 5) & 0x0f;
  const d = date & 0x1f;
  const h = (time >> 11) & 0x1f;
  const mi = (time >> 5) & 0x3f;
  const s = (time & 0x1f) * 2;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d)}/${pad(mo)}/${y} ${pad(h)}:${pad(mi)}:${pad(s)}`;
}

export class ZipError extends Error {}

/** Lê o diretório central e devolve a lista de itens do ZIP. */
export async function listZip(blob) {
  const tailSize = Math.min(blob.size, 22 + 65535 + 20);
  const tail = await readRange(blob, blob.size - tailSize, blob.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('Arquivo ZIP inválido ou corrompido (fim do diretório central não encontrado).');

  let count = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);

  // ZIP64: localizador logo antes do registro de fim de diretório.
  if ((count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) && eocd >= 20 && u32(tail, eocd - 20) === 0x07064b50) {
    const z64Offset = u64(tail, eocd - 20 + 8);
    const z64 = await readRange(blob, z64Offset, z64Offset + 56);
    if (u32(z64, 0) !== 0x06064b50) throw new ZipError('Estrutura ZIP64 inválida.');
    count = u64(z64, 32);
    cdSize = u64(z64, 40);
    cdOffset = u64(z64, 48);
  }

  const cd = await readRange(blob, cdOffset, cdOffset + cdSize);
  const entries = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.byteLength || u32(cd, p) !== 0x02014b50) throw new ZipError('Diretório central do ZIP corrompido.');
    const flags = u16(cd, p + 8);
    const method = u16(cd, p + 10);
    const time = u16(cd, p + 12);
    const date = u16(cd, p + 14);
    const crc32 = u32(cd, p + 16);
    let compressedSize = u32(cd, p + 20);
    let size = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    let localOffset = u32(cd, p + 42);
    const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen);
    const name = decodeName(nameBytes, (flags & 0x800) !== 0);

    // Campo extra ZIP64 (0x0001) com os valores que não couberam em 32 bits.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = u16(cd, e);
      const len = u16(cd, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = u64(cd, q); q += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = u64(cd, q); q += 8; }
        if (localOffset === 0xffffffff) { localOffset = u64(cd, q); q += 8; }
      }
      e += 4 + len;
    }

    entries.push({
      path: name,
      isDirectory: name.endsWith('/'),
      encrypted: (flags & 1) !== 0,
      method,
      crc32: crc32.toString(16).padStart(8, '0'),
      compressedSize,
      size,
      modified: dosDate(date, time),
      localOffset,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Calcula o hash de cada item do ZIP. Para itens de texto que pareçam ser a
 * conversa exportada, devolve também o conteúdo em `text` (para o resumo).
 */
export async function hashZipEntries(blob, { algos = REPORT_ALGOS, onBytes = () => {}, isCancelled = () => false, wantText = () => false } = {}) {
  const entries = await listZip(blob);
  const results = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (isCancelled()) throw new Error('cancelado');
    const item = { path: entry.path, size: entry.size, compressedSize: entry.compressedSize, modified: entry.modified, crc32: entry.crc32, method: entry.method === 0 ? 'armazenado' : entry.method === 8 ? 'deflate' : `método ${entry.method}` };

    if (entry.encrypted || (entry.method !== 0 && entry.method !== 8)) {
      item.error = entry.encrypted ? 'Item protegido por senha; hash não calculado.' : 'Método de compressão não suportado; hash não calculado.';
      results.push(item);
      continue;
    }

    const header = await readRange(blob, entry.localOffset, entry.localOffset + 30);
    if (u32(header, 0) !== 0x04034b50) {
      item.error = 'Cabeçalho local do item corrompido.';
      results.push(item);
      continue;
    }
    const dataStart = entry.localOffset + 30 + u16(header, 26) + u16(header, 28);

    const hashers = await createHashers(algos);
    const crc = await createCRC32();
    crc.init();
    const collect = wantText(entry);
    const textParts = [];
    const probe = isVideoName(entry.path) ? createVideoProbe() : null;
    let produced = 0;
    const sink = (chunk) => {
      for (const [, h] of hashers) h.update(chunk);
      crc.update(chunk);
      probe?.push(chunk);
      produced += chunk.length;
      if (collect) textParts.push(chunk.slice());
    };

    let inflater = null;
    if (entry.method === 8) inflater = new Inflate((chunk) => sink(chunk));

    const end = dataStart + entry.compressedSize;
    for (let offset = dataStart; offset < end; offset += CHUNK) {
      if (isCancelled()) throw new Error('cancelado');
      const chunk = new Uint8Array(await blob.slice(offset, Math.min(offset + CHUNK, end)).arrayBuffer());
      const final = offset + CHUNK >= end;
      if (inflater) inflater.push(chunk, final);
      else sink(chunk);
      onBytes(chunk.length);
    }

    Object.assign(item, finish(hashers));
    item.size = produced;
    if (probe?.result()) item.video = probe.result();
    const computedCrc = crc.digest('hex');
    item.crcOk = computedCrc === entry.crc32;
    if (collect) item.text = concat(textParts);
    results.push(item);
  }
  return results;
}

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
