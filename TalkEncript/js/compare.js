// Comparação dos prints (capturas de tela) com o texto da conversa exportada.
// O operador transcreve um trecho visível no print e o sistema procura esse
// trecho no arquivo de texto exportado, ignorando acentos, maiúsculas e espaços.

const INVISIBLE = /[​-‏‪-‮⁠﻿]/g;

export function normalizeForSearch(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(INVISIBLE, '')
    .toLowerCase()
    .replace(/[“”"«»]/g, '"')
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza como normalizeForSearch e guarda, para cada caractere normalizado, a posição
 * do caractere de origem, para destacar no texto original o trecho encontrado.
 */
function normalizeWithMap(text) {
  const chars = [];
  const map = [];
  let i = 0;
  for (const ch of text) {
    const at = i;
    i += ch.length;
    if (/\s/.test(ch)) {
      if (chars.length && chars[chars.length - 1] !== ' ') { chars.push(' '); map.push(at); }
      continue;
    }
    const out = normalizeForSearch(ch) || '';
    // Uma posição por unidade UTF-16, para coincidir com os índices de indexOf.
    for (let k = 0; k < out.length; k++) { chars.push(out[k]); map.push(at); }
  }
  if (chars[chars.length - 1] === ' ') { chars.pop(); map.pop(); }
  return { norm: chars.join(''), map, ends: map.map((m) => m + String.fromCodePoint(text.codePointAt(m)).length) };
}

/** Posição [início, fim) do trecho procurado dentro da linha original, ou null. */
export function locateInLine(line, snippet) {
  const needle = normalizeForSearch(snippet);
  if (!needle) return null;
  const { norm, map, ends } = normalizeWithMap(line);
  const at = norm.indexOf(needle);
  if (at < 0) return null;
  return [map[at], ends[at + needle.length - 1]];
}

/**
 * Procura cada linha do trecho informado nos textos das conversas.
 * @param texts [{ arquivo, texto }]
 * @param snippet trecho transcrito do print (pode ter várias linhas)
 * @returns { situacao, partes: [{ trecho, ocorrencias: [{ arquivo, linha, conteudo, destaque: [início, fim] }] }] }
 */
export function compareSnippet(texts, snippet) {
  const parts = String(snippet ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { situacao: 'não solicitada', partes: [] };
  if (!texts.length) return { situacao: 'sem conversa em texto para comparar', partes: parts.map((trecho) => ({ trecho, ocorrencias: [] })) };

  const indexed = texts.map(({ arquivo, texto }) => ({
    arquivo,
    linhas: texto.replace(/\r\n?/g, '\n').split('\n').map((conteudo) => ({ conteudo, norm: normalizeForSearch(conteudo) })),
  }));

  const partes = parts.map((trecho) => {
    const needle = normalizeForSearch(trecho);
    const ocorrencias = [];
    if (needle.length >= 3) {
      for (const { arquivo, linhas } of indexed) {
        linhas.forEach((l, i) => {
          if (ocorrencias.length < 5 && l.norm.includes(needle)) {
            const limpo = l.conteudo.replace(INVISIBLE, '');
            const destaque = locateInLine(limpo, trecho);
            const conteudo = limpo.slice(0, Math.max(300, destaque?.[1] ?? 0));
            ocorrencias.push({ arquivo, linha: i + 1, conteudo, destaque });
          }
        });
      }
    }
    return { trecho, ocorrencias };
  });

  const found = partes.filter((p) => p.ocorrencias.length).length;
  const situacao = found === partes.length ? 'encontrado' : found ? 'parcialmente encontrado' : 'não encontrado';
  return { situacao, partes };
}

/** Quantidade de páginas de um PDF (estimativa pela contagem de objetos /Page). */
export function countPdfPages(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  const matches = text.match(/\/Type\s*\/Page(?![s\w])/g);
  return matches ? matches.length : null;
}
