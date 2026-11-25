// Reconhecimento e resumo informativo das conversas exportadas.
// O resumo não altera nem substitui o hash: serve apenas para descrever o conteúdo.

const WHATSAPP_NAME = /(^|\/)(_chat\.txt|(conversa|chat) do whatsapp.*\.txt|whatsapp chat.*\.txt)$/i;
const TELEGRAM_JSON = /(^|\/)result\.json$/i;
const TELEGRAM_HTML = /(^|\/)messages\d*\.html$/i;
const GENERIC_TEXT = /\.(txt|json|html?|csv)$/i;

export const MAX_CHAT_BYTES = 64 * 1024 * 1024;

/** Indica se vale a pena ler o conteúdo do arquivo para gerar o resumo. */
export function isChatCandidate(path, size) {
  return size <= MAX_CHAT_BYTES && (WHATSAPP_NAME.test(path) || TELEGRAM_JSON.test(path) || TELEGRAM_HTML.test(path) || /\.txt$/i.test(path));
}

export function looksLikeTextFile(path) {
  return GENERIC_TEXT.test(path);
}

// [01/10/2026, 10:00:00] Nome: texto            (iOS)
// 01/10/2026 10:00 - Nome: texto                (Android)
// 10/1/26, 10:00 AM - Nome: texto               (Android em inglês)
const WA_LINE = /^‎?\[?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp]\.?\s?[Mm]\.?)?)\]?\s*(?:-\s*)?([^:]{1,80}?):\s?(.*)$/;
const WA_SYSTEM = /^‎?\[?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp]\.?\s?[Mm]\.?)?)\]?\s*(?:-\s*)?(.*)$/;
const WA_ATTACHMENT = /<(anexado|attached):|\(arquivo anexado\)|\(file attached\)|<m[íi]dia oculta>|<media omitted>/i;

export function summarizeWhatsApp(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const participants = new Map();
  let messages = 0;
  let attachments = 0;
  let systemLines = 0;
  let first = null;
  let last = null;

  for (const raw of lines) {
    const line = raw.replace(/^﻿/, '');
    const match = line.match(WA_LINE);
    if (match) {
      const [, date, time, author, body] = match;
      messages++;
      const name = author.replace(/^‎/, '').trim();
      participants.set(name, (participants.get(name) ?? 0) + 1);
      if (WA_ATTACHMENT.test(body)) attachments++;
      const stamp = `${date} ${time}`;
      first ??= stamp;
      last = stamp;
    } else if (WA_SYSTEM.test(line)) {
      systemLines++;
      const [, date, time] = line.match(WA_SYSTEM);
      first ??= `${date} ${time}`;
      last = `${date} ${time}`;
    }
  }

  if (!messages) return null;
  return {
    plataforma: 'WhatsApp',
    mensagens: messages,
    mensagensDoSistema: systemLines,
    anexosReferidos: attachments,
    participantes: [...participants.entries()].sort((a, b) => b[1] - a[1]).map(([nome, total]) => ({ nome, mensagens: total })),
    primeiraMensagem: first,
    ultimaMensagem: last,
    linhas: lines.length,
  };
}

export function summarizeTelegramJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  const chats = Array.isArray(data?.chats?.list) ? data.chats.list : data?.messages ? [data] : [];
  if (!chats.length) return null;
  const participants = new Map();
  let messages = 0;
  let attachments = 0;
  let first = null;
  let last = null;
  for (const chat of chats) {
    for (const msg of chat.messages ?? []) {
      if (msg.type !== 'message') continue;
      messages++;
      const name = msg.from ?? msg.actor ?? 'Desconhecido';
      participants.set(name, (participants.get(name) ?? 0) + 1);
      if (msg.photo || msg.file || msg.media_type) attachments++;
      const stamp = String(msg.date ?? '').replace('T', ' ');
      first ??= stamp;
      last = stamp;
    }
  }
  return {
    plataforma: 'Telegram',
    nomeDaConversa: chats.length === 1 ? chats[0].name ?? null : `${chats.length} conversas`,
    mensagens: messages,
    anexosReferidos: attachments,
    participantes: [...participants.entries()].sort((a, b) => b[1] - a[1]).map(([nome, total]) => ({ nome, mensagens: total })),
    primeiraMensagem: first,
    ultimaMensagem: last,
  };
}

export function summarizeTelegramHTML(text) {
  const messages = (text.match(/class="message default/g) ?? []).length;
  if (!messages) return null;
  const names = [...text.matchAll(/<div class="from_name">\s*([^<]+?)\s*</g)].map((m) => m[1].trim());
  const participants = new Map();
  for (const n of names) participants.set(n, (participants.get(n) ?? 0) + 1);
  const dates = [...text.matchAll(/class="pull_right date details" title="([^"]+)"/g)].map((m) => m[1]);
  return {
    plataforma: 'Telegram',
    mensagens: messages,
    participantes: [...participants.entries()].map(([nome, total]) => ({ nome, mensagens: total })),
    primeiraMensagem: dates[0] ?? null,
    ultimaMensagem: dates.at(-1) ?? null,
  };
}

/** Escolhe o leitor adequado pelo nome do arquivo. */
export function summarizeChat(path, bytes) {
  const text = new TextDecoder('utf-8').decode(bytes);
  let summary = null;
  if (TELEGRAM_JSON.test(path)) summary = summarizeTelegramJSON(text);
  else if (TELEGRAM_HTML.test(path)) summary = summarizeTelegramHTML(text);
  else summary = summarizeWhatsApp(text);
  return summary ? { arquivo: path, ...summary } : null;
}
