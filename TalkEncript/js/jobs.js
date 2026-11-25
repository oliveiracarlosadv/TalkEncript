// Processamento de um lote de arquivos: hash, conteúdo dos ZIPs e resumo da conversa.
// Usado pelo Web Worker e, se o navegador não permitir workers (por exemplo, ao
// abrir o arquivo único direto do disco em alguns navegadores), na própria página.

import { hashBlob, hashZipEntries, ALGORITHMS, REPORT_ALGOS, isVideoName, createVideoProbe } from './hashing.js';
import { isChatCandidate, summarizeChat } from './chat.js';

const isZip = (path) => /\.zip$/i.test(path);

/** Traduz os erros do navegador quando um arquivo selecionado deixa de estar disponível. */
export function friendlyReadError(error, path) {
  const name = error?.name ?? '';
  const message = String(error?.message ?? error);
  if (name === 'NotFoundError' || name === 'NotReadableError' || /could not be (found|read)|not readable|requested file/i.test(message)) {
    const e = new Error(`o arquivo "${path}" não pôde ser lido. Ele foi movido, renomeado, apagado ou alterado depois de selecionado (por exemplo, exportado de novo com o mesmo nome), ou está em uma pasta da nuvem que ainda não foi baixada para o computador (OneDrive, iCloud, Google Drive), ou foi escolhido de dentro de um ZIP aberto sem extrair. Copie o arquivo para uma pasta comum do computador, remova-o da lista e selecione-o novamente.`);
    e.code = 'arquivo-indisponivel';
    e.path = path;
    return e;
  }
  return error;
}
const describe = (a) => ({ id: a, nome: ALGORITHMS[a].label, bits: ALGORITHMS[a].bits, norma: ALGORITHMS[a].norma ?? 'FIPS 180-4' });

/**
 * @param data { id, items: [{ file, path }], options: { algos, zip, chat, keepText } }
 * @param post função que recebe as mensagens de progresso e de conclusão
 * @param isCancelled função que indica se o usuário cancelou
 */
export async function runHashJob(data, post, isCancelled = () => false) {
  const { id, items, options } = data;
  const algos = options.algos ?? REPORT_ALGOS;
  const total = items.reduce((n, it) => n + it.file.size * (options.zip && isZip(it.path) ? 2 : 1), 0) || 1;
  let done = 0;
  let lastPost = 0;
  const progress = (message, force = false) => {
    const now = Date.now();
    if (!force && now - lastPost < 120) return;
    lastPost = now;
    post({ id, type: 'progress', fraction: Math.min(done / total, 1), message });
  };

  try {
    const files = [];
    const chats = [];
    const texts = [];
    const addChat = (path, bytes) => {
      const summary = summarizeChat(path, bytes);
      if (summary) chats.push(summary);
      if (options.keepText) texts.push({ arquivo: path, texto: new TextDecoder('utf-8').decode(bytes) });
    };

    for (const [index, { file, path }] of items.entries()) {
      const label = `Arquivo ${index + 1} de ${items.length}: ${path}`;
      progress(label, true);
      const startedAt = new Date().toISOString();
      let hashes;
      const probe = isVideoName(path) ? createVideoProbe() : null;
      try {
        hashes = await hashBlob(file, algos, (n) => { done += n; progress(label); }, isCancelled, probe);
      } catch (error) {
        throw friendlyReadError(error, path);
      }
      const record = {
        path,
        name: file.name,
        size: file.size,
        type: file.type || null,
        lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
        ...hashes,
        inicioCalculo: startedAt,
        fimCalculo: new Date().toISOString(),
      };
      if (probe?.result()) record.video = probe.result();

      if (options.chat && isChatCandidate(path, file.size)) {
        try {
          addChat(path, new Uint8Array(await file.arrayBuffer()));
        } catch (error) {
          throw friendlyReadError(error, path);
        }
      }

      if (options.zip && isZip(path)) {
        progress(`Lendo o conteúdo de ${path}`, true);
        try {
          record.zipEntries = await hashZipEntries(file, {
            algos,
            onBytes: (n) => { done += n; progress(`Conteúdo de ${path}`); },
            isCancelled,
            wantText: (entry) => options.chat && isChatCandidate(entry.path, entry.size),
          });
          for (const entry of record.zipEntries) {
            if (entry.text) {
              addChat(`${path} > ${entry.path}`, entry.text);
              delete entry.text;
            }
          }
        } catch (error) {
          if (error.message === 'cancelado') throw error;
          const friendly = friendlyReadError(error, path);
          if (friendly.code === 'arquivo-indisponivel') throw friendly;
          record.zipError = error.message;
        }
      }
      files.push(record);
    }
    done = total;
    progress('Concluído', true);
    post({ id, type: 'done', files, chats, texts, algos: algos.map(describe) });
  } catch (error) {
    post({ id, type: 'error', message: error.message === 'cancelado' ? 'cancelado' : String(error.message ?? error) });
  }
}
