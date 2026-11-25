// Página pública de verificação dos relatórios do TalkEncript (validador online do QR code).
// Publicada em oliveiracarlosadv/TalkEncript-Verificar (GitHub Pages). Tudo acontece no
// navegador de quem confere: nenhum arquivo é enviado a servidor.
//
// O endereço do QR code traz, após o "#", o número do relatório (r) e o código de
// verificação (c = SHA-256 do relatorio_<id>.json). A pessoa arrasta o pacote do relatório
// (ZIP ou pasta extraída) e os arquivos da conversa; a página confere o JSON com o código
// e cada arquivo com os códigos hash registrados (SHA-256 e, quando houver, SHA3-512).

import { createSHA256, createSHA3 } from '../vendor/hash-wasm.esm.min.js';
import { unzipSync } from '../vendor/fflate.esm.js';

const CHUNK = 8 * 1024 * 1024;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baseName = (p) => String(p).split(/[\\/]/).pop().split(' > ').pop();

/** Lê "#r=...&c=..." do endereço. */
export function parseFragment(hash) {
  const params = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const c = (params.get('c') ?? '').toLowerCase();
  return { id: params.get('r') ?? null, codigo: /^[0-9a-f]{64}$/.test(c) ? c : null };
}

/** Itens registrados no JSON do relatório, com os hashes de cada um. */
export function expectedItems(report) {
  const itens = [];
  const add = (grupo, caminho, rec) => { if (rec?.sha256) itens.push({ grupo, caminho, sha256: rec.sha256, sha3_512: rec.sha3_512 ?? null }); };
  for (const f of report.arquivos ?? []) {
    add('Conversa exportada', f.path, f);
    const pasta = baseName(f.path).replace(/\.zip$/i, '');
    for (const e of f.zipEntries ?? []) add('Itens do ZIP da conversa', `${pasta}/${e.path}`, e);
  }
  for (const p of report.prints ?? []) add('Prints', p.path, p);
  if (report.transcricao) add('Arquivos gerados', report.transcricao.arquivo, report.transcricao);
  for (const p of report.printsPdf?.partes ?? []) add('Arquivos gerados', p.arquivo, p);
  for (const m of report.metadados ?? []) add('Metadados técnicos', m.arquivo, m);
  return itens;
}

/** Linhas "hash *arquivo" de um manifesto. */
export function parseManifestText(text) {
  return text.split('\n').map((l) => l.replace(/\r$/, '')).map((l) => /^\\?([0-9a-f]{64}) [ *](.+)$/.exec(l)).filter(Boolean).map((m) => ({ sha256: m[1], caminho: m[2] }));
}

async function hashBlob(blob, onBytes) {
  const a = await createSHA256();
  const b = await createSHA3(512);
  a.init();
  b.init();
  for (let o = 0; o < blob.size; o += CHUNK) {
    const chunk = new Uint8Array(await blob.slice(o, o + CHUNK).arrayBuffer());
    a.update(chunk);
    b.update(chunk);
    onBytes?.(chunk.length);
  }
  return { sha256: a.digest('hex'), sha3_512: b.digest('hex') };
}

const isPackageZip = (entries) => Object.keys(entries).some((n) => /(^|\/)relatorio_TE-[^/]+\.json$/.test(n));

export function startVerifier() {
  const frag = parseFragment(location.hash);
  if (frag.id) {
    $('dados-relatorio').innerHTML = `<dl class="dados"><dt>Relatório nº</dt><dd>${esc(frag.id)}</dd><dt>Código de verificação</dt><dd class="hash">${esc(frag.codigo ?? 'não informado no endereço')}</dd></dl>`;
    document.title = `Verificar relatório ${frag.id} - TalkEncript`;
  }

  let report = null;
  let reportOk = null;
  let itens = [];
  let manifesto = [];
  const estado = new Map();
  const linhas = [];

  const selo = (s) => ({ ok: '<span class="selo ok">Íntegro</span>', falha: '<span class="selo falha">Alterado</span>', aviso: '<span class="selo aviso">Não registrado</span>', pendente: '<span class="selo pendente">Não apresentado</span>' }[s]);
  const render = () => {
    const ok = linhas.filter((l) => l.s === 'ok').length;
    const falha = linhas.filter((l) => l.s === 'falha').length;
    const fora = linhas.length - ok - falha;
    let v = '';
    if (report) {
      v += reportOk === true
        ? `<div class="veredito ok">Relatório nº ${esc(report.id)} autêntico: o arquivo de dados do relatório confere com o código de verificação.</div>`
        : reportOk === false
          ? '<div class="veredito falha">O arquivo de dados do relatório NÃO confere com o código de verificação do QR code: o relatório foi alterado ou não é o deste endereço.</div>'
          : `<div class="veredito aviso">Relatório nº ${esc(report.id)} carregado. Confira se o código de verificação abaixo é igual ao impresso no rodapé do relatório.</div>`;
    } else if (linhas.length) {
      v += '<div class="veredito aviso">Arraste também o pacote do relatório (o ZIP baixado ou a pasta extraída), para que os arquivos sejam comparados com os códigos registrados.</div>';
    }
    if (linhas.length) {
      v += `<div class="veredito ${falha ? 'falha' : fora ? 'aviso' : 'ok'}">${falha ? `${falha} arquivo(s) ALTERADO(S): o conteúdo não corresponde ao registrado.` : `${ok} arquivo(s) ÍNTEGRO(S).`}${fora && !falha ? ` ${fora} arquivo(s) não consta(m) do relatório.` : ''}</div>`;
    }
    $('veredito').innerHTML = v;
    $('linhas').innerHTML = linhas.map((l) => `<tr><td>${selo(l.s)}</td><td>${esc(l.nome)}</td><td>${esc(l.detalhe)}</td></tr>`).join('');
    $('resultado').hidden = !linhas.length;
    if (report) {
      $('registrados-cartao').hidden = false;
      const grupos = [...new Set(itens.map((i) => i.grupo))];
      $('registrados').innerHTML = grupos.map((g) => `<tr><th colspan="3">${esc(g)}</th></tr>${itens.filter((i) => i.grupo === g).map((i) => `<tr><td>${selo(estado.get(i) ?? 'pendente')}</td><td>${esc(i.caminho)}</td><td class="hash">${i.sha256}</td></tr>`).join('')}`).join('');
    }
  };

  const compare = (nome, h, tamanhoInfo = '') => {
    const porHash = itens.filter((i) => i.sha256 === h.sha256);
    if (porHash.length) {
      porHash.forEach((i) => estado.set(i, 'ok'));
      const sha3 = porHash[0].sha3_512 ? (porHash[0].sha3_512 === h.sha3_512 ? '; SHA-256 e SHA3-512 conferem' : '; ATENÇÃO: SHA3-512 diferente') : '';
      linhas.push({ s: sha3.includes('ATENÇÃO') ? 'falha' : 'ok', nome, detalhe: `idêntico a ${porHash[0].caminho} (${porHash[0].grupo})${sha3}` });
      return;
    }
    const doPacote = manifesto.find((m) => m.sha256 === h.sha256);
    if (doPacote) {
      linhas.push({ s: 'ok', nome, detalhe: `arquivo do pacote do relatório (${doPacote.caminho})${/\.pdf$/i.test(nome) && /^Relatório_/.test(baseName(nome)) ? '; confira também a assinatura digital do PDF em validar.iti.gov.br' : ''}` });
      return;
    }
    const mesmoNome = itens.filter((i) => baseName(i.caminho) === baseName(nome));
    const noManifesto = manifesto.filter((m) => baseName(m.caminho) === baseName(nome));
    if (mesmoNome.length || noManifesto.length) {
      mesmoNome.forEach((i) => { if (estado.get(i) !== 'ok') estado.set(i, 'falha'); });
      linhas.push({ s: 'falha', nome, detalhe: `ALTERADO: SHA-256 calculado ${h.sha256}, diferente do registrado${tamanhoInfo}` });
      return;
    }
    linhas.push({ s: 'aviso', nome, detalhe: `não consta do relatório (SHA-256 ${h.sha256})` });
  };

  async function processar(lista) {
    lista = lista.filter((f) => !/^\./.test(baseName(f.name)));
    if (!lista.length) return;
    $('progresso').hidden = false;
    // 1) Pacotes em ZIP: os arquivos de dentro entram como arquivos soltos.
    const arquivos = [];
    for (const f of lista) {
      if (/\.zip$/i.test(f.name) && f.size < 300 * 1024 * 1024) {
        try {
          const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
          if (isPackageZip(entries)) {
            for (const [n, bytes] of Object.entries(entries)) if (!n.endsWith('/')) arquivos.push({ name: baseName(n), path: n, blob: new Blob([bytes]) });
            continue;
          }
        } catch { /* não é um pacote: conferido como arquivo */ }
      }
      arquivos.push({ name: f.name, path: f.webkitRelativePath || f.name, blob: f });
    }
    // 2) Dados do relatório e manifesto do pacote primeiro.
    const json = arquivos.find((a) => /^relatorio_TE-.+\.json$/.test(a.name));
    if (json) {
      const h = await hashBlob(json.blob);
      try {
        report = JSON.parse(await json.blob.text());
        itens = expectedItems(report);
        estado.clear();
        reportOk = frag.codigo ? h.sha256 === frag.codigo : null;
        $('dados-relatorio').innerHTML = `<dl class="dados"><dt>Relatório nº</dt><dd>${esc(report.id)}</dd><dt>Título</dt><dd>${esc(report.titulo ?? '')}</dd><dt>Operador</dt><dd>${esc(report.operador?.nome)}${report.operador?.oab ? ` (${esc(report.operador.oab)})` : ''}</dd><dt>Gerado em</dt><dd>${esc(new Date(report.momento?.fim).toLocaleString('pt-BR'))} (${esc(report.momento?.offset ?? '')})</dd><dt>Código de verificação calculado</dt><dd class="hash">${h.sha256}</dd>${frag.codigo ? `<dt>Código do QR code</dt><dd class="hash">${frag.codigo}</dd>` : ''}${report.assinatura ? `<dt>Assinatura digital</dt><dd>${esc(report.assinatura.titular)}${report.assinatura.cpf ? `, CPF ${esc(report.assinatura.cpf)}` : ''} (${esc(report.assinatura.tipo)}, emitido por ${esc(report.assinatura.emissor)})</dd>` : ''}</dl>`;
        if (frag.id && report.id !== frag.id) reportOk = false;
      } catch {
        linhas.push({ s: 'falha', nome: json.name, detalhe: 'arquivo de dados do relatório ilegível' });
      }
    }
    const pacote = arquivos.find((a) => /^pacote_TE-.+\.sha256$/.test(a.name));
    if (pacote) manifesto = parseManifestText(await pacote.blob.text());
    // 3) Demais arquivos.
    const resto = arquivos.filter((a) => a !== json && a !== pacote && !/^(verificar\.(sh|bat|ps1)|Verificar integridade_TE-.+\.html)$/.test(a.name));
    const total = resto.reduce((n, a) => n + a.blob.size, 0) || 1;
    let feito = 0;
    for (const a of resto) {
      $('status').textContent = `Calculando os códigos de ${a.name}...`;
      const base = feito;
      const h = await hashBlob(a.blob, (n) => { feito += n; $('progresso').firstElementChild.style.width = `${((100 * feito) / total).toFixed(1)}%`; });
      feito = base + a.blob.size;
      compare(a.path, h);
      render();
    }
    $('progresso').firstElementChild.style.width = '100%';
    $('status').textContent = `Conferência concluída: ${resto.length + (json ? 1 : 0)} arquivo(s).`;
    render();
  }

  const lerEntrada = (entry, lista) => new Promise((resolve) => {
    if (entry.isFile) { entry.file((f) => { lista.push(f); resolve(); }, () => resolve()); return; }
    if (!entry.isDirectory) { resolve(); return; }
    const reader = entry.createReader();
    let todos = [];
    const ler = () => reader.readEntries((lote) => {
      if (!lote.length) { Promise.all(todos.map((e) => lerEntrada(e, lista))).then(resolve); return; }
      todos = todos.concat([...lote]);
      ler();
    }, () => resolve());
    ler();
  });
  const zona = $('zona');
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('ativa'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('ativa'));
  zona.addEventListener('drop', async (e) => {
    e.preventDefault();
    zona.classList.remove('ativa');
    const entries = [...(e.dataTransfer.items ?? [])].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) {
      const lista = [];
      for (const en of entries) await lerEntrada(en, lista);
      processar(lista);
    } else processar([...e.dataTransfer.files]);
  });
  $('btn-arquivos').onclick = () => $('entrada-arquivos').click();
  $('btn-pasta').onclick = () => $('entrada-pasta').click();
  $('entrada-arquivos').onchange = (e) => { processar([...e.target.files]); e.target.value = ''; };
  $('entrada-pasta').onchange = (e) => { processar([...e.target.files]); e.target.value = ''; };
  $('btn-imprimir').onclick = () => window.print();
  render();
}

if (typeof document !== 'undefined' && document.getElementById('zona')) startVerifier();
