// Web Worker: calcula os hashes fora da linha principal para a página não travar.
// Nenhum arquivo sai do computador do usuário.

import { runHashJob } from './jobs.js';

let cancelled = false;

self.onmessage = ({ data }) => {
  if (data.cmd === 'cancel') { cancelled = true; return; }
  if (data.cmd !== 'hash') return;
  cancelled = false;
  runHashJob(data, (msg) => self.postMessage(msg), () => cancelled);
};
