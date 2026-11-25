import { UFS, formatCNPJorCPF, formatCPF, formatMobile, formatOAB, isValidIMEI, maskIMEI, normalizeUrl, onlyDigits, validateOperator } from './validators.js';
import {
  APP, PLATFORMS, buildBlocks, buildManifests, formatBytes, formatDateTime, makeReportId, offsetLabel,
  googleMapsUrl, joinNames, manifestLine, packageNames, parseManifest, renderText, resultadoComparacao, zipFolderName,
} from './report.js';
import { LIMITE_PRINTS_PDF, imageFormat, renderPrintsPDF } from './prints-pdf.js';
import { buildVerifierHtml } from './verificador.js';
import { buildBatch, buildPowerShellScript, buildShellScript, verificationItems } from './verificacao-terminal.js';
import { renderPDF, toBase64 } from './pdf.js';
import { detectAlgorithm, normalizeHex, ALGORITHMS, REPORT_ALGOS, hashBytes } from './hashing.js';
import { readCertificate, signPdf } from './assinatura.js';
import { runHashJob, friendlyReadError } from './jobs.js';
import { compareSnippet, countPdfPages } from './compare.js';
import { lookupAddress } from './address.js';
import { renderTranscriptPDF } from './transcript.js';
import { zipSync } from '../vendor/fflate.esm.js';

// Na versão em arquivo único (TalkEncript.html), o código do worker, as fontes e
// a identificação da versão vêm embutidos na própria página.
const BUNDLE = globalThis.__TALKENCRIPT__ ?? null;
const asset = (path) => new URL(path, document.baseURI);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const STORAGE_KEY = 'talkencript.operador';
const IGNORED = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|\._[^/]*)$/i;

// ---------------------------------------------------------------------------
// Utilidades

const store = {
  get() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); } catch { return null; }
  },
  set(value) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return true; } catch { return false; }
  },
  clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* sem armazenamento */ }
  },
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) if (child != null) node.append(child);
  return node;
}

function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) { const old = button.textContent; button.textContent = 'Copiado'; setTimeout(() => { button.textContent = old; }, 1500); }
  } catch { /* área de transferência indisponível */ }
}

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-copiar]');
  if (btn) copy($(btn.dataset.copiar).textContent, btn);
});

// ---------------------------------------------------------------------------
// Abas

function showTab(name) {
  for (const b of $$('.abas button')) b.setAttribute('aria-selected', String(b.dataset.aba === name));
  for (const s of $$('.aba')) s.hidden = s.id !== `aba-${name}`;
  try { sessionStorage.setItem('talkencript.aba', name); } catch { /* ignorado */ }
  window.scrollTo({ top: 0 });
}
for (const b of $$('.abas button')) b.addEventListener('click', () => showTab(b.dataset.aba));

// ---------------------------------------------------------------------------
// Operador

const form = $('#operador-form');
const ufSelect = form.elements.oabUF;
ufSelect.append(el('option', { value: '' }, 'UF'), ...UFS.map((uf) => el('option', { value: uf }, uf)));

form.elements.cpf.addEventListener('input', (e) => { e.target.value = formatCPF(e.target.value); });
form.elements.empresaDocumento.addEventListener('input', (e) => { e.target.value = formatCNPJorCPF(e.target.value); });
form.elements.celular.addEventListener('input', (e) => { e.target.value = formatMobile(e.target.value); });
for (const r of form.elements.advogado) r.addEventListener('change', () => { $('.oab', form).hidden = form.elements.advogado.value !== 'sim'; });

function readOperatorForm() {
  const f = form.elements;
  return {
    nome: f.nome.value.trim().replace(/\s+/g, ' '),
    email: f.email.value.trim().toLowerCase(),
    celular: formatMobile(f.celular.value),
    cpf: formatCPF(f.cpf.value),
    profissao: f.profissao.value.trim().replace(/\s+/g, ' '),
    empresaNome: f.empresaNome.value.trim().replace(/\s+/g, ' '),
    empresaEndereco: f.empresaEndereco.value.trim().replace(/\s+/g, ' '),
    empresaDocumento: formatCNPJorCPF(f.empresaDocumento.value),
    links: [1, 2].map((n) => ({ titulo: f[`link${n}Titulo`].value.trim(), url: normalizeUrl(f[`link${n}Url`].value) })).filter((l) => l.titulo || l.url),
    advogado: f.advogado.value === 'sim',
    oabNumero: f.oabNumero.value.trim().toUpperCase(),
    oabUF: f.oabUF.value,
    consentimento: f.consentimento.checked,
  };
}

function fillOperatorForm(op) {
  const f = form.elements;
  f.nome.value = op?.nome ?? '';
  f.email.value = op?.email ?? '';
  f.celular.value = op?.celular ?? '';
  f.cpf.value = op?.cpf ?? '';
  f.profissao.value = op?.profissao ?? '';
  f.empresaNome.value = op?.empresaNome ?? '';
  f.empresaEndereco.value = op?.empresaEndereco ?? '';
  f.empresaDocumento.value = op?.empresaDocumento ?? '';
  [1, 2].forEach((n) => {
    f[`link${n}Titulo`].value = op?.links?.[n - 1]?.titulo ?? '';
    f[`link${n}Url`].value = op?.links?.[n - 1]?.url ?? '';
  });
  f.advogado.value = op?.advogado ? 'sim' : 'nao';
  f.oabNumero.value = op?.oabNumero ?? '';
  f.oabUF.value = op?.oabUF ?? '';
  f.consentimento.checked = Boolean(op?.consentimento);
  $('.oab', form).hidden = !op?.advogado;
}

function operatorView(op) {
  return {
    nome: op.nome,
    cpf: op.cpf,
    profissao: op.profissao || (op.advogado ? 'Advogado(a)' : null),
    email: op.email,
    celular: op.celular,
    oab: op.advogado ? formatOAB(op.oabNumero, op.oabUF) : null,
    escritorio: op.empresaNome || op.empresaEndereco || op.empresaDocumento
      ? { nome: op.empresaNome || null, endereco: op.empresaEndereco || null, documento: op.empresaDocumento || null }
      : null,
    links: op.links ?? [],
    cadastradoEm: op.cadastradoEm,
    consentimentoLGPD: op.consentimentoEm,
  };
}

let operator = store.get();

function renderOperator() {
  const has = Boolean(operator);
  $('#operador-resumo').hidden = !has;
  form.hidden = has;
  $('#operador-cancelar').hidden = !has;
  $('#gerar-bloqueio').hidden = has;
  $('#gerar-conteudo').hidden = !has;
  if (has) {
    const v = operatorView(operator);
    const dl = $('#operador-dados');
    dl.replaceChildren();
    const rows = [['Nome', v.nome], ['Profissão', v.profissao ?? 'não informada'], ['CPF', v.cpf], ['E-mail', v.email], ['Celular', v.celular], ['OAB', v.oab ?? 'não advogado(a)'],
      ...(v.escritorio?.nome ? [['Escritório ou empresa', v.escritorio.nome]] : []),
      ...(v.escritorio?.endereco ? [['Endereço do escritório ou empresa', v.escritorio.endereco]] : []),
      ...(v.escritorio?.documento ? [['CNPJ/CPF do escritório ou empresa', v.escritorio.documento]] : []),
      ...v.links.map((l, i) => [`Link ${i + 1}`, `${l.titulo}: ${l.url}`]), ['Cadastrado em', formatDateTime(v.cadastradoEm)]];
    for (const [k, val] of rows) dl.append(el('dt', {}, k), el('dd', {}, val));
  }
}

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const op = readOperatorForm();
  const errors = validateOperator(op);
  for (const small of $$('[data-erro]', form)) small.textContent = errors[small.dataset.erro] ?? '';
  for (const name of ['nome', 'email', 'celular', 'cpf']) form.elements[name].classList.toggle('invalido', Boolean(errors[name]));
  if (Object.keys(errors).length) return;
  const now = new Date().toISOString();
  const firstTime = !operator;
  operator = { ...op, cpf: formatCPF(onlyDigits(op.cpf)), cadastradoEm: operator?.cadastradoEm ?? now, consentimentoEm: now, atualizadoEm: now };
  if (!store.set(operator)) {
    alert('Não foi possível gravar o cadastro neste navegador (armazenamento bloqueado). Os dados valerão apenas enquanto esta página estiver aberta.');
  }
  renderOperator();
  // Primeiro cadastro: segue direto para a geração do relatório.
  if (firstTime) showTab('gerar');
});

$('#operador-editar').addEventListener('click', () => { fillOperatorForm(operator); form.hidden = false; $('#operador-resumo').hidden = true; });
$('#operador-cancelar').addEventListener('click', renderOperator);
$('#operador-ir-gerar').addEventListener('click', () => showTab('gerar'));
$('#operador-sair').addEventListener('click', () => {
  if (!confirm('Apagar os dados do operador deste dispositivo? Os relatórios já emitidos não são afetados.')) return;
  store.clear();
  operator = null;
  fillOperatorForm(null);
  renderOperator();
});

// ---------------------------------------------------------------------------
// Seleção de arquivos

async function filesFromDrop(dataTransfer) {
  const entries = [...dataTransfer.items].filter((i) => i.kind === 'file').map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dataTransfer.files].map((file) => ({ file, path: file.name }));
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, path: prefix + entry.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  };
  for (const entry of entries) await walk(entry, '');
  return out;
}

const fromInput = (input) => [...input.files].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
const clean = (items) => items.filter((it) => !IGNORED.test(it.path));

function mergeItems(list, items) {
  const keys = new Set(list.map((it) => `${it.path}|${it.file.size}|${it.file.lastModified}`));
  for (const it of clean(items)) {
    const key = `${it.path}|${it.file.size}|${it.file.lastModified}`;
    if (!keys.has(key)) { keys.add(key); list.push(it); }
  }
  list.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
}

let selected = [];

function renderSelected() {
  const box = $('#lista-arquivos');
  box.replaceChildren();
  if (!selected.length) return;
  for (const it of selected) {
    box.append(el('div', { class: 'item' },
      el('span', { class: 'nome' }, it.path),
      el('span', { class: 'tamanho' }, formatBytes(it.file.size).replace(/ \(.*\)$/, '')),
      el('button', { type: 'button', title: 'Remover', onclick: () => { selected = selected.filter((x) => x !== it); renderSelected(); } }, 'Remover')));
  }
  const total = selected.reduce((n, it) => n + it.file.size, 0);
  box.append(el('div', { class: 'total' }, `${selected.length} arquivo(s), ${formatBytes(total)}`));
}

const zone = $('#zona-arquivos');
zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('ativa'); });
zone.addEventListener('dragleave', () => zone.classList.remove('ativa'));
zone.addEventListener('drop', async (e) => {
  e.preventDefault();
  zone.classList.remove('ativa');
  mergeItems(selected, await filesFromDrop(e.dataTransfer));
  renderSelected();
});
for (const id of ['#entrada-arquivos', '#entrada-pasta']) {
  $(id).addEventListener('change', (e) => { mergeItems(selected, fromInput(e.target)); e.target.value = ''; renderSelected(); });
}

$('#caso-plataforma').append(...PLATFORMS.map((p) => el('option', { value: p }, p)));

// Versão do aplicativo: o rótulo acompanha o aplicativo escolhido.
const VERSION_HINTS = {
  WhatsApp: 'No WhatsApp: Configurações, Ajuda (iPhone) ou Configurações, Ajuda, Informações do app (Android).',
  Telegram: 'No Telegram: a versão aparece no final da tela de Configurações.',
  Signal: 'No Signal: Configurações, Ajuda (a versão aparece no topo).',
  Instagram: 'No Instagram: Perfil, menu, Configurações e privacidade, Sobre.',
};
function updateVersionLabel() {
  const app = $('#caso-plataforma').value;
  $('#rotulo-versao').textContent = `Versão do ${app}`;
  $('#dica-versao').textContent = VERSION_HINTS[app] ?? 'Informe a versão que aparece nas configurações ou na tela Sobre do aplicativo.';
}
$('#caso-plataforma').addEventListener('change', updateVersionLabel);
updateVersionLabel();

// Interlocutores: começa com dois e permite incluir quantos forem necessários.
const speakersBox = $('#lista-interlocutores');

function addSpeaker(nome = '', telefone = '', qualificacao = '') {
  const row = el('div', { class: 'interlocutor' },
    el('span', { class: 'numero' }),
    el('input', { 'data-campo': 'nome', placeholder: 'Nome completo do interlocutor', 'aria-label': 'Nome completo do interlocutor', value: nome }),
    el('input', { 'data-campo': 'telefone', inputmode: 'tel', placeholder: 'Número de telefone, ex.: (91) 98888-7777', 'aria-label': 'Número de telefone do interlocutor', value: telefone }),
    el('input', { 'data-campo': 'qualificacao', list: 'sugestoes-qualificacao', placeholder: 'Qualificação no caso (opcional), ex.: Reclamante, Reclamado, Esposa, Marido', 'aria-label': 'Qualificação do interlocutor no caso', value: qualificacao }),
    el('button', { type: 'button', title: 'Remover interlocutor', onclick: () => { row.remove(); renumberSpeakers(); } }, 'Remover'));
  const phone = $('[data-campo=telefone]', row);
  phone.addEventListener('blur', () => { phone.value = formatPhone(phone.value); });
  speakersBox.append(row);
  renumberSpeakers();
  return row;
}

function renumberSpeakers() {
  const rows = $$('.interlocutor', speakersBox);
  rows.forEach((row, i) => {
    $('.numero', row).textContent = `${i + 1}.`;
    $('button', row).disabled = rows.length <= 2;
  });
}

/** Formata telefones brasileiros; números estrangeiros (com +) ficam como digitados. */
function formatPhone(value) {
  const text = String(value ?? '').trim();
  if (text.startsWith('+') && !text.startsWith('+55')) return text;
  const d = onlyDigits(text).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return text;
}

function readSpeakers() {
  return $$('.interlocutor', speakersBox)
    .map((row) => ({
      nome: $('[data-campo=nome]', row).value.trim().replace(/\s+/g, ' '),
      telefone: formatPhone($('[data-campo=telefone]', row).value),
      qualificacao: $('[data-campo=qualificacao]', row).value.trim().replace(/\s+/g, ' ') || null,
    }))
    .filter((it) => it.nome || it.telefone);
}

$('#caso-imei').addEventListener('input', (e) => {
  const d = onlyDigits(e.target.value).slice(0, 15);
  e.target.value = d.replace(/^(\d{2})(\d{0,6})(\d{0,6})(\d{0,1}).*/, (_, a, b, c, x) => [a, b, c, x].filter(Boolean).join(' '));
});
$('#caso-sem-imei').addEventListener('change', (e) => { $('#caso-imei').disabled = e.target.checked; if (e.target.checked) $('#caso-imei').value = ''; });

$('#adicionar-interlocutor').addEventListener('click', () => { $('[data-campo=nome]', addSpeaker()).focus(); });
addSpeaker();
addSpeaker();

// ---------------------------------------------------------------------------
// Worker de hash

let worker = null;
let workerBroken = false;
let jobCounter = 0;
let localCancel = false;

function createWorker() {
  if (BUNDLE?.workerCode) {
    const url = URL.createObjectURL(new Blob([BUNDLE.workerCode], { type: 'text/javascript' }));
    return new Worker(url);
  }
  return new Worker(asset('js/worker.js'), { type: 'module' });
}

/** Executa o cálculo na própria página quando o navegador não permite workers. */
function runLocally(data, onProgress) {
  localCancel = false;
  return new Promise((resolve, reject) => {
    runHashJob(data, (msg) => {
      if (msg.type === 'progress') onProgress?.(msg.fraction, msg.message);
      else if (msg.type === 'done') resolve(msg);
      else reject(new Error(msg.message));
    }, () => localCancel);
  });
}

function runWorker(items, options, onProgress) {
  const id = ++jobCounter;
  const data = { cmd: 'hash', id, items, options };
  if (!workerBroken) {
    try { worker ??= createWorker(); } catch { workerBroken = true; }
  }
  if (workerBroken) return runLocally(data, onProgress);
  return new Promise((resolve, reject) => {
    let started = false;
    const cleanup = () => { worker.removeEventListener('message', handler); worker.removeEventListener('error', onError); };
    const handler = ({ data: msg }) => {
      if (msg.id !== id) return;
      started = true;
      if (msg.type === 'progress') onProgress?.(msg.fraction, msg.message);
      else {
        cleanup();
        if (msg.type === 'done') resolve(msg);
        else reject(new Error(msg.message));
      }
    };
    const onError = (e) => {
      cleanup();
      if (!started) {
        // Worker bloqueado (ex.: arquivo aberto do disco em navegador restritivo).
        workerBroken = true;
        worker = null;
        runLocally(data, onProgress).then(resolve, reject);
      } else {
        reject(new Error(e.message || 'Falha no processamento.'));
      }
    };
    worker.addEventListener('message', handler);
    worker.addEventListener('error', onError);
    worker.postMessage(data);
  });
}

const cancelWorker = () => { localCancel = true; worker?.postMessage({ cmd: 'cancel' }); };

// ---------------------------------------------------------------------------
// Geolocalização e hora de referência

let geo = null;

// A localização é obrigatória e precisa: aceita-se leitura com raio de até
// PRECISAO_MAXIMA metros, buscando chegar a PRECISAO_IDEAL metros.
const PRECISAO_MAXIMA = 100;
const PRECISAO_IDEAL = 20;
const AJUDA_PRECISAO = 'Ative a localização precisa: no celular, ligue o GPS e, no iPhone, a opção "Localização Precisa"; no Android, "Precisão da localização do Google"; no computador, ative os serviços de localização do sistema e o Wi-Fi (mesmo sem conectar a uma rede) e tente novamente perto de uma janela.';

class LocationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * Acompanha as leituras do GPS por até `timeout` milissegundos e devolve a mais
 * precisa; termina antes se atingir a precisão ideal.
 */
function getPrecisePosition({ timeout = 30000, onUpdate } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new LocationError('suporte', 'este navegador não oferece geolocalização'));
    if (!window.isSecureContext) return reject(new LocationError('seguranca', 'a página foi aberta sem conexão segura (HTTPS)'));
    let best = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      navigator.geolocation.clearWatch(watch);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(new LocationError('indisponivel', 'nenhuma posição foi obtida pelo dispositivo'));
    };
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const reading = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          precisao: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          momento: new Date(pos.timestamp).toISOString(),
        };
        if (!best || reading.precisao < best.precisao) best = reading;
        onUpdate?.(best);
        if (best.precisao <= PRECISAO_IDEAL) finish();
      },
      (err) => {
        if (err.code === 1) {
          finished = true;
          navigator.geolocation.clearWatch(watch);
          clearTimeout(timer);
          reject(new LocationError('negada', 'permissão de localização negada'));
        } else if (err.code === 2 && !best) {
          // Posição indisponível no momento: continua aguardando até o tempo limite.
        }
      },
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    );
    const timer = setTimeout(finish, timeout);
  });
}

function renderGeo() {
  const status = $('#geo-status');
  if (!geo?.latitude) return;
  const ok = geo.precisao <= PRECISAO_MAXIMA;
  const mapa = $('#geo-mapa');
  mapa.href = googleMapsUrl(geo.latitude, geo.longitude);
  mapa.hidden = false;
  status.textContent = `Localização ${ok ? 'precisa obtida' : 'imprecisa'}: ${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)} (raio de ${Math.round(geo.precisao)} m${ok ? '' : `; o máximo aceito é ${PRECISAO_MAXIMA} m`}).`;
}

// Bloqueio: sem autorização de localização o aplicativo não pode ser usado.
const lockBox = $('#bloqueio-localizacao');
let closing = false;

function showLock(title, message, actions = []) {
  $('.marca-inicial', lockBox).hidden = false;
  $('h2', lockBox).textContent = title;
  $('p', lockBox).textContent = message;
  $('.acoes', lockBox).replaceChildren(...actions);
  lockBox.hidden = false;
  document.body.classList.add('bloqueado');
}

function hideLock() {
  lockBox.hidden = true;
  document.body.classList.remove('bloqueado');
}

function closeForDeniedLocation() {
  if (closing) return;
  closing = true;
  cancelWorker();
  let seconds = 10;
  const message = () => `O TalkEncript precisa da sua localização precisa para registrar no relatório o local da geração, como parte da cadeia de custódia. A permissão foi negada. O aplicativo será fechado em ${seconds} segundo${seconds === 1 ? '' : 's'}. Para usar o TalkEncript, abra-o novamente e permita o acesso à localização quando o navegador solicitar; se a permissão já estiver bloqueada, libere-a nas configurações do site, no ícone ao lado do endereço.`;
  showLock('Localização obrigatória', message());
  const tick = setInterval(() => {
    seconds--;
    $('p', lockBox).textContent = message();
    if (seconds > 0) return;
    clearInterval(tick);
    window.close();
    // Se o navegador não permitir fechar a aba, o aplicativo é encerrado na própria página.
    setTimeout(() => {
      document.title = 'TalkEncript encerrado';
      document.body.replaceChildren(el('main', { class: 'encerrado' },
        el('h1', {}, 'TalkEncript encerrado'),
        el('p', {}, 'O aplicativo foi encerrado porque a permissão de localização foi negada. A localização precisa é obrigatória para a emissão do relatório.'),
        el('p', {}, 'Para usar novamente, libere a localização para esta página nas configurações do navegador e clique em Tentar novamente.'),
        el('button', { class: 'botao primario', onclick: () => location.reload() }, 'Tentar novamente')));
    }, 400);
  }, 1000);
}

/** Pedido de autorização ao abrir o aplicativo, antes de qualquer uso. */
async function requireLocationAtStart() {
  showLock('Autorização de localização', 'Antes de iniciar, o TalkEncript solicita acesso à sua localização precisa, que constará do relatório. Clique em Permitir na mensagem do navegador.');
  let started = false;
  // Assim que a permissão é concedida, o aplicativo inicia imediatamente; a
  // leitura precisa continua em segundo plano e é exigida de novo na geração.
  const start = () => {
    if (started || closing) return;
    started = true;
    hideLock();
    showTab(operator ? 'gerar' : 'operador');
  };
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    if (status) {
      status.onchange = () => {
        if (status.state === 'denied') closeForDeniedLocation();
        else if (status.state === 'granted') start();
      };
      if (status.state === 'denied') { closeForDeniedLocation(); return; }
      if (status.state === 'granted') start();
    }
  } catch { /* navegador sem a API de permissões */ }
  try {
    geo = await getPrecisePosition({ timeout: 20000, onUpdate: (g) => { geo = g; renderGeo(); start(); } });
    renderGeo();
    start();
  } catch (error) {
    if (error.code === 'negada') { closeForDeniedLocation(); return; }
    if (started) {
      // Permissão concedida, mas sem leitura ainda: avisa no passo 4, sem bloquear.
      $('#geo-status').textContent = `Localização ainda não obtida: ${error.message}. Ela será lida novamente na geração do relatório.`;
      return;
    }
    showLock('Localização indisponível', `Não foi possível obter a localização: ${error.message}. ${AJUDA_PRECISAO}`, [
      el('button', { class: 'botao primario', onclick: () => requireLocationAtStart() }, 'Tentar novamente'),
    ]);
  }
}

$('#geo-obter').addEventListener('click', async () => {
  $('#geo-status').textContent = 'Obtendo localização precisa...';
  try {
    geo = await getPrecisePosition({ onUpdate: (g) => { geo = g; renderGeo(); } });
    renderGeo();
  } catch (error) {
    if (error.code === 'negada') closeForDeniedLocation();
    else $('#geo-status').textContent = `Localização não obtida: ${error.message}.`;
  }
});

async function serverTime() {
  if (location.protocol === 'file:') return null;
  try {
    const before = Date.now();
    const res = await fetch(location.href.split('#')[0], { method: 'HEAD', cache: 'no-store' });
    const header = res.headers.get('date');
    if (!header) return null;
    const server = new Date(header);
    const local = (before + Date.now()) / 2;
    return { data: server.toISOString(), origem: `cabeçalho Date do servidor ${location.host}`, diferencaSegundos: Math.round((local - server.getTime()) / 1000) };
  } catch {
    return null;
  }
}

/** Hash do código da própria ferramenta, para auditoria da versão utilizada. */
const TOOL_FILES = ['codigo-fonte.html', 'css/style.css', 'js/app.js', 'js/worker.js', 'js/jobs.js', 'js/hashing.js', 'js/report.js', 'js/pdf.js', 'js/chat.js', 'js/compare.js', 'js/address.js', 'js/transcript.js', 'js/validators.js', 'vendor/hash-wasm.esm.min.js', 'vendor/fflate.esm.js', 'vendor/jspdf.umd.min.js', 'js/assinatura.js', 'vendor/forge.esm.js', 'vendor/qrcode-generator.esm.js', 'vendor/pdf-lib.esm.min.js'];
async function toolHashes() {
  // Arquivo único: os hashes dos arquivos-fonte foram calculados na montagem.
  if (BUNDLE?.codigo) return BUNDLE.codigo;
  const out = [];
  for (const file of TOOL_FILES) {
    try {
      const res = await fetch(asset(file), { cache: 'no-store' });
      if (res.ok) out.push({ arquivo: file, sha256: await sha256Hex(await res.arrayBuffer()) });
    } catch { /* arquivo indisponível */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// PDF: carregamento sob demanda do jsPDF e das fontes

let pdfDeps = null;
function loadPdfDeps() {
  pdfDeps ??= (async () => {
    if (!window.jspdf) {
      await new Promise((resolve, reject) => {
        const s = el('script', { src: asset('vendor/jspdf.umd.min.js').href });
        s.onload = resolve;
        s.onerror = () => reject(new Error('Não foi possível carregar o gerador de PDF.'));
        document.head.append(s);
      });
    }
    // Símbolo do sistema em branco, para a faixa do cabeçalho dos PDFs.
    if (BUNDLE?.fonts) return { jsPDF: window.jspdf.jsPDF, fonts: BUNDLE.fonts, simbolo: BUNDLE.simbolo ?? null, simboloCor: BUNDLE.simboloCor ?? null };
    const font = async (name) => toBase64(await (await fetch(asset(`vendor/fonts/${name}`))).arrayBuffer());
    const [regular, bold] = await Promise.all([font('LiberationSans-Regular.ttf'), font('LiberationSans-Bold.ttf')]);
    let simbolo = null;
    let simboloCor = null;
    try { simbolo = toBase64(await (await fetch(asset('img/simbolo-branco.png'))).arrayBuffer()); } catch { /* sem símbolo na faixa */ }
    try { simboloCor = toBase64(await (await fetch(asset('img/simbolo.png'))).arrayBuffer()); } catch { /* sem símbolo no relatório */ }
    return { jsPDF: window.jspdf.jsPDF, fonts: { regular, bold }, simbolo, simboloCor };
  })();
  pdfDeps.catch(() => { pdfDeps = null; });
  return pdfDeps;
}

// ---------------------------------------------------------------------------
// Prints (opcionais)

let prints = [];
const PRINT_TYPES = /\.(png|jpe?g|pdf)$/i;

/**
 * Reduz uma imagem que, sozinha, ultrapassa o limite de 5 MB do PDF dos prints:
 * converte para JPEG e, a cada nova tentativa, diminui a resolução.
 */
async function shrinkImage(print, tentativa) {
  try {
    const bitmap = await createImageBitmap(new Blob([print.original ?? print.bytes]));
    const scale = Math.pow(0.8, tentativa - 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), formato: 'JPEG', largura: canvas.width, altura: canvas.height } : null;
  } catch {
    return null;
  }
}

async function imageInfo(file) {
  try {
    const bitmap = await createImageBitmap(file);
    // Reprodução em página inteira no relatório: até 1600 pixels no lado maior.
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const info = { largura: bitmap.width, altura: bitmap.height, miniatura: canvas.toDataURL('image/jpeg', 0.85), miniaturaLargura: canvas.width, miniaturaAltura: canvas.height };
    bitmap.close?.();
    return info;
  } catch {
    return {};
  }
}

function addPrints(items) {
  for (const it of clean(items)) {
    if (!PRINT_TYPES.test(it.path)) { alert(`O arquivo "${it.path}" não é JPG, PNG ou PDF e não foi incluído nos prints.`); continue; }
    if (prints.some((p) => p.path === it.path && p.file.size === it.file.size)) continue;
    const entry = { ...it, trecho: '', preview: /\.pdf$/i.test(it.path) ? null : URL.createObjectURL(it.file) };
    prints.push(entry);
  }
  renderPrints();
}

function renderPrints() {
  const box = $('#lista-prints');
  box.replaceChildren(...prints.map((pr) => el('div', { class: 'print' },
    pr.preview ? el('img', { class: 'miniatura', src: pr.preview, alt: `Print ${pr.path}` }) : el('div', { class: 'miniatura' }, 'PDF'),
    el('div', { class: 'info' },
      el('div', { class: 'topo-print' },
        el('strong', {}, pr.path),
        el('span', { class: 'ajuda' }, formatBytes(pr.file.size).replace(/ \(.*\)$/, '')),
        el('button', { type: 'button', onclick: () => { if (pr.preview) URL.revokeObjectURL(pr.preview); prints = prints.filter((x) => x !== pr); renderPrints(); } }, 'Remover')),
      el('label', { class: 'campo' }, 'Mensagem que aparece no print (escreva como está no print; uma mensagem por linha)',
        el('textarea', { rows: 3, placeholder: 'Ex.: Bom dia! Segue a foto do contrato.', oninput: (e) => { pr.trecho = e.target.value; } }, pr.trecho))))));
}

const printZone = $('#zona-prints');
printZone.addEventListener('dragover', (e) => { e.preventDefault(); printZone.classList.add('ativa'); });
printZone.addEventListener('dragleave', () => printZone.classList.remove('ativa'));
printZone.addEventListener('drop', async (e) => { e.preventDefault(); printZone.classList.remove('ativa'); addPrints(await filesFromDrop(e.dataTransfer)); });
$('#entrada-prints').addEventListener('change', (e) => { addPrints(fromInput(e.target)); e.target.value = ''; });

// ---------------------------------------------------------------------------
// Geração do relatório

// ---------------------------------------------------------------------------
// Assinatura digital com certificado A1 (opcional). O certificado e a senha ficam só na
// memória desta página, enquanto ela estiver aberta.

let credencial = null;
const certStatus = $('#cert-status');
const showCertStatus = (text, ok) => { certStatus.textContent = text; certStatus.className = ok ? 'ajuda cert-ok' : text ? 'erro' : 'ajuda'; };

async function conferirCertificado() {
  const file = $('#cert-arquivo').files[0];
  if (!file) { credencial = null; showCertStatus(''); return null; }
  try {
    credencial = readCertificate(new Uint8Array(await file.arrayBuffer()), $('#cert-senha').value);
  } catch (error) {
    credencial = null;
    showCertStatus(`Não foi possível usar o certificado: ${error.message}`, false);
    throw new Error(`não foi possível usar o certificado digital: ${error.message}`);
  }
  $('#cert-senha').value = '';
  const d = credencial.dados;
  showCertStatus(`Certificado conferido: ${d.titular}${d.cpf ? `, CPF ${d.cpf}` : ''}${d.cnpj ? `, CNPJ ${d.cnpj}` : ''} (${d.tipo}, emitido por ${d.emissor}, válido até ${new Date(d.validoAte).toLocaleDateString('pt-BR')}). O relatório será assinado digitalmente.`, true);
  $('#cert-remover').hidden = false;
  return credencial;
}
$('#cert-conferir').addEventListener('click', () => conferirCertificado().catch(() => {}));
$('#cert-arquivo').addEventListener('change', () => { credencial = null; showCertStatus($('#cert-arquivo').files[0] ? 'Informe a senha e clique em Conferir certificado.' : ''); $('#cert-remover').hidden = !$('#cert-arquivo').files[0]; });
$('#cert-remover').addEventListener('click', () => {
  credencial = null;
  $('#cert-arquivo').value = '';
  $('#cert-senha').value = '';
  $('#cert-remover').hidden = true;
  showCertStatus('');
});

let running = false;

function setProgress(box, fraction, message) {
  box.hidden = false;
  $('progress', box).value = fraction;
  $('span', box).textContent = message;
}

function showError(box, message) {
  box.hidden = !message;
  box.textContent = message ?? '';
}

function hasMedia(files) {
  const textual = /\.(txt|json|html?|css|js)$/i;
  return files.some((f) => (f.zipEntries ? f.zipEntries.some((e) => !textual.test(e.path)) : !textual.test(f.path)));
}

$('#gerar').addEventListener('click', generate);
$('#gerar-cancelar').addEventListener('click', cancelWorker);

/** Janela de progresso da geração, com a porcentagem do processo inteiro. */
const genProgress = (() => {
  const box = $('#progresso-geracao');
  const bar = $('.barra', box);
  let current = 0;
  const update = (pct, message) => {
    current = Math.max(current, Math.min(100, Math.round(pct)));
    $('#progresso-pct').textContent = String(current);
    $('.barra-preenchida', box).style.width = `${current}%`;
    bar.setAttribute('aria-valuenow', String(current));
    if (message) $('#progresso-etapa').textContent = message;
  };
  return {
    show() { current = 0; update(0, 'Preparando...'); $('#gerar-cancelar').disabled = false; box.hidden = false; },
    hide() { box.hidden = true; },
    update,
    /** Etapa que ocupa a faixa de `from` a `to` por cento. */
    stage: (from, to) => (fraction, message) => update(from + (to - from) * Math.min(Math.max(fraction, 0), 1), message),
  };
})();

async function generate() {
  if (running) return;
  const errorBox = $('#gerar-erro');
  showError(errorBox, null);
  if (!operator) { showTab('operador'); return; }
  if (!selected.length) { showError(errorBox, 'Selecione os arquivos da conversa.'); return; }
  // Prints são opcionais; se forem juntados, cada um precisa de trecho transcrito para a comparação.
  const semTrecho = prints.filter((p) => p.trecho.trim().length < 5);
  const printError = semTrecho.length
    ? `Para comparar os prints com a conversa, descreva a mensagem que aparece no print (com pelo menos 5 caracteres) em ${semTrecho.length === 1 ? 'o print' : 'cada um dos prints'} ${semTrecho.map((p) => `"${p.path}"`).join(', ')}, ou remova ${semTrecho.length === 1 ? 'o print' : 'os prints'} da lista.`
    : '';
  $('#erro-prints').textContent = printError;
  for (const t of $$('#lista-prints textarea')) t.classList.toggle('invalido', t.value.trim().length < 5);
  if (printError) { showError(errorBox, printError); return; }
  const speakers = readSpeakers();
  const speakerError = speakers.some((it) => !it.nome)
    ? 'Informe o nome de cada interlocutor cujo telefone foi preenchido.'
    : speakers.some((it) => it.telefone && onlyDigits(it.telefone).length < 8)
      ? 'Confira os telefones dos interlocutores: informe o número completo, com DDD.'
      : '';
  $('#erro-interlocutores').textContent = speakerError;
  if (speakerError) { showError(errorBox, speakerError); return; }
  const conversaInicio = $('#caso-conversa-inicio').value || null;
  const conversaFim = $('#caso-conversa-fim').value || null;
  if (conversaInicio && conversaFim && conversaFim < conversaInicio) { showError(errorBox, 'A data final da conversa não pode ser anterior à data inicial.'); return; }
  // IMEI: conferido por inteiro, mas só a versão mascarada segue para o relatório.
  const semImei = $('#caso-sem-imei').checked;
  const imeiDigits = onlyDigits($('#caso-imei').value);
  const imeiError = semImei ? '' : !imeiDigits
    ? 'Informe o IMEI do aparelho (digite *#06# no telefone) ou marque "Não se aplica".'
    : !isValidIMEI(imeiDigits) ? 'IMEI inválido: confira os 15 dígitos.' : '';
  $('#erro-imei').textContent = imeiError;
  if (imeiError) { showError(errorBox, imeiError); return; }
  const imeiMascarado = semImei ? null : maskIMEI(imeiDigits);
  if (!$('#declaracao').checked) { showError(errorBox, 'Para emitir o relatório é necessário marcar a declaração do operador.'); return; }
  if ($('#cert-arquivo').files[0] && !credencial) {
    try { await conferirCertificado(); } catch (error) { showError(errorBox, `Não foi possível gerar o relatório: ${error.message}`); return; }
  }

  running = true;
  $('#gerar').disabled = true;
  genProgress.show();
  $('#resultado').hidden = true;
  const events = [];
  const log = (descricao) => events.push({ momento: new Date().toISOString(), descricao });
  const op = operatorView(operator);
  const inicio = new Date();

  try {
    log(`Procedimento iniciado por ${op.nome}, CPF ${op.cpf}${op.oab ? `, ${op.oab}` : ''}, no ${APP.rotulo} (${APP.edicao}).`);
    log('Declaração de origem e não edição dos arquivos aceita pelo operador.');

    // Leitura nova e precisa no momento da geração (obrigatória).
    const geoStage = genProgress.stage(0, 10);
    geoStage(0, 'Obtendo a localização precisa do dispositivo...');
    try {
      geo = await getPrecisePosition({ onUpdate: (g) => geoStage(Math.min(PRECISAO_IDEAL / g.precisao, 0.9), `Obtendo a localização precisa: raio atual de ${Math.round(g.precisao)} m...`) });
      geoStage(1, 'Localização obtida.');
    } catch (error) {
      if (error.code === 'negada') { closeForDeniedLocation(); throw new Error('a permissão de localização foi negada.'); }
      throw new Error(`a localização precisa é obrigatória e não foi obtida (${error.message}). ${AJUDA_PRECISAO}`);
    }
    renderGeo();
    if (geo.precisao > PRECISAO_MAXIMA) {
      throw new Error(`a localização obtida não é precisa (raio de ${Math.round(geo.precisao)} m; o máximo aceito é ${PRECISAO_MAXIMA} m). ${AJUDA_PRECISAO}`);
    }
    log(`Geolocalização precisa obtida: ${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}, raio de ${Math.round(geo.precisao)} m.`);

    let endereco = null;
    if (geo.latitude != null && $('#opcao-endereco').checked) {
      genProgress.update(10, 'Consultando o endereço por extenso no OpenStreetMap...');
      endereco = await lookupAddress(geo.latitude, geo.longitude, geo.precisao);
      log(endereco.motivo
        ? `Endereço por extenso não obtido: ${endereco.motivo}.`
        : `Endereço por extenso consultado em ${endereco.fonte} (enviadas apenas as coordenadas): ${endereco.enderecoCompleto ?? 'sem descrição'}.`);
    }

    genProgress.update(15, 'Consultando a hora de referência e verificando a ferramenta...');
    const [horaServidor, codigo] = await Promise.all([serverTime(), toolHashes()]);
    log(horaServidor ? `Hora de referência obtida do servidor (diferença de ${horaServidor.diferencaSegundos} s em relação ao dispositivo).` : 'Hora de referência do servidor indisponível; utilizado o relógio do dispositivo.');

    const totalBytes = selected.reduce((n, it) => n + it.file.size, 0);
    log(`Selecionados ${selected.length} arquivo(s), totalizando ${formatBytes(totalBytes)}: ${selected.map((it) => it.path).slice(0, 20).join('; ')}${selected.length > 20 ? '; ...' : ''}.`);
    log('Início do cálculo dos hashes SHA-256, SHA-512 e SHA3-512, realizado localmente no navegador.');
    const options = { zip: $('#opcao-zip').checked, chat: $('#opcao-resumo').checked || prints.some((p) => p.trecho.trim()), keepText: true, algos: REPORT_ALGOS };
    genProgress.update(20, 'Calculando os hashes SHA-256, SHA-512 e SHA3-512...');
    const result = await runWorker(selected.map(({ file, path }) => ({ file, path })), options, genProgress.stage(20, 80));
    const innerCount = result.files.reduce((n, f) => n + (f.zipEntries?.length ?? 0), 0);
    log(`Cálculo concluído: ${result.files.length} arquivo(s)${innerCount ? ` e ${innerCount} item(ns) internos de ZIP` : ''}.`);
    if (prints.length && !(result.texts ?? []).some((t) => t.texto.trim())) {
      throw new Error('para comparar os prints com a conversa, é preciso enviar no passo 2 o texto da conversa exportada (por exemplo, o _chat.txt do WhatsApp, inclusive dentro do ZIP, ou o result.json do Telegram). Exporte a conversa novamente e envie o arquivo completo, ou remova os prints.');
    }
    let printRecords = [];
    if (prints.length) {
      log(`Juntados ${prints.length} print(s) pelo operador: ${prints.map((p) => p.path).join('; ')}.`);
      const printResult = await runWorker(prints.map(({ file, path }) => ({ file, path })), { zip: false, chat: false, algos: REPORT_ALGOS }, (f, m) => genProgress.stage(80, 88)(f, `Prints: ${m}`));
      printRecords = [];
      for (const [i, rec] of printResult.files.entries()) {
        const pr = prints[i];
        let extra;
        try {
          extra = /\.pdf$/i.test(pr.path)
            ? { paginas: countPdfPages(new Uint8Array(await pr.file.arrayBuffer())) }
            : await imageInfo(pr.file);
        } catch (error) {
          throw friendlyReadError(error, pr.path);
        }
        const comparacao = compareSnippet(result.texts ?? [], pr.trecho);
        // Print idêntico, byte a byte, a algum arquivo da conversa exportada (por exemplo, imagem enviada na conversa).
        const identicos = [
          ...result.files.filter((f) => f.sha256 === rec.sha256).map((f) => f.path),
          ...result.files.flatMap((f) => (f.zipEntries ?? []).filter((e) => e.sha256 === rec.sha256).map((e) => `${f.path} > ${e.path}`)),
        ];
        printRecords.push({ ...rec, ...extra, trecho: pr.trecho.trim() || null, comparacao, arquivosIdenticos: identicos });
      }
      const compared = printRecords.filter((r) => r.comparacao.situacao !== 'não solicitada');
      log(`Hash dos prints calculado${compared.length ? `; comparação com a conversa exportada: ${compared.map((r) => `${r.path} (${r.comparacao.situacao})`).join('; ')}` : ''}.`);
    }
    const crcFail = result.files.flatMap((f) => (f.zipEntries ?? []).filter((e) => e.crcOk === false));
    if (crcFail.length) log(`Atenção: ${crcFail.length} item(ns) de ZIP com CRC-32 divergente (arquivo possivelmente corrompido).`);

    genProgress.update(88, 'Montando o relatório...');
    const fim = new Date();
    const id = makeReportId(fim);
    const names = packageNames(id, speakers);
    const tipoEscolhido = $('#caso-tipo').value;

    // Transcrição integral, linha a linha, do texto da conversa exportada (.txt).
    genProgress.update(88, 'Gerando a transcrição integral da conversa em PDF...');
    const { jsPDF, fonts, simbolo: pdfSimbolo, simboloCor } = await loadPdfDeps();
    const hashPorArquivo = new Map();
    for (const f of result.files) {
      hashPorArquivo.set(f.path, f.sha256);
      for (const e of f.zipEntries ?? []) hashPorArquivo.set(`${f.path} > ${e.path}`, e.sha256);
    }
    const conversasReconhecidas = new Set(result.chats.map((c) => c.arquivo));
    // Cabeçalho técnico comum ao Relatório e à Transcrição integral.
    const cabecalhoTecnico = (momento) => ({
      relatorio: names.pasta,
      operador: op.nome,
      escritorio: op.escritorio?.nome ?? null,
      simbolo: pdfSimbolo,
      cpf: op.cpf,
      motivo: op.profissao || 'não informado',
      interlocutores: speakers.map((it) => ({ nome: it.nome, telefone: it.telefone, qualificacao: it.qualificacao })),
      // Data e hora em uma linha e o fuso horário na seguinte, para caber na coluna.
      dataGeracao: `${formatDateTime(momento.toISOString())}\nFuso horário ${offsetLabel(momento.getTimezoneOffset())}`,
    });
    const fontesTranscricao = (result.texts ?? [])
      .filter((t) => /\.txt$/i.test(t.arquivo) && conversasReconhecidas.has(t.arquivo))
      .map((t) => ({ arquivo: t.arquivo, sha256: hashPorArquivo.get(t.arquivo) ?? null, texto: t.texto }));
    let transcricao = null;
    let transcricaoBytes = null;
    if (fontesTranscricao.length) {
      const t = renderTranscriptPDF(jsPDF, fonts, { id, operador: op.nome, cabecalho: cabecalhoTecnico(fim), sources: fontesTranscricao }, (f) => genProgress.update(88 + f * 2, 'Gerando a transcrição integral da conversa em PDF...'));
      transcricaoBytes = new Uint8Array(t.bytes);
      transcricao = {
        arquivo: names.conversa,
        tamanho: transcricaoBytes.length,
        ...(await hashBytes(transcricaoBytes, REPORT_ALGOS)),
        paginas: t.paginas,
        linhas: t.linhas,
        caracteresRepresentadosPorCodigo: t.substituidos,
        caracteresInvisiveisOmitidos: t.omitidos,
        origens: fontesTranscricao.map(({ arquivo, sha256 }) => ({ arquivo, sha256 })),
      };
      log(`Transcrição integral da conversa gerada em PDF (${names.conversa}): ${t.linhas} linha(s), ${t.paginas} página(s).`);
    }

    // Prints reunidos em PDF, em arquivos de até 5 MB (divididos quando necessário).
    let printsPdf = null;
    const printsPdfFiles = {};
    if (prints.length) {
      genProgress.update(90, 'Reunindo os prints em PDF...');
      const itens = [];
      for (const [i, pr] of prints.entries()) {
        let bytes;
        try { bytes = new Uint8Array(await pr.file.arrayBuffer()); } catch (error) { throw friendlyReadError(error, pr.path); }
        const rec = printRecords[i];
        const ehPdf = /\.pdf$/i.test(pr.path);
        itens.push({
          indice: i + 1, total: prints.length, path: pr.path, tipo: ehPdf ? 'pdf' : 'imagem', bytes, original: bytes,
          formato: ehPdf ? null : imageFormat(bytes), largura: rec.largura, altura: rec.altura,
          sha256: rec.sha256, trecho: rec.trecho, resultado: resultadoComparacao(rec.comparacao?.situacao ?? 'não solicitada'),
        });
      }
      const r = await renderPrintsPDF(jsPDF, fonts, { id, operador: op.nome, cabecalho: cabecalhoTecnico(fim) }, itens, {
        limite: Number($('#prints-limite').value) || LIMITE_PRINTS_PDF,
        shrink: shrinkImage,
        onProgress: (f) => genProgress.update(90 + f, 'Reunindo os prints em PDF...'),
      });
      const partes = [];
      for (const parte of r.partes) {
        printsPdfFiles[parte.nome] = parte.bytes;
        partes.push({ arquivo: parte.nome, ...(await hashBytes(parte.bytes, REPORT_ALGOS)), tamanho: parte.bytes.length, paginas: parte.paginas, prints: parte.prints.map((n) => prints[n - 1].path) });
      }
      printsPdf = { limiteBytes: Number($('#prints-limite').value) || LIMITE_PRINTS_PDF, partes, comprimidos: r.comprimidos, acimaDoLimite: r.acimaDoLimite };
      log(`Prints condensados em PDF: ${partes.length} arquivo(s) de até ${(printsPdf.limiteBytes / 1e6).toLocaleString('pt-BR')} MB (${partes.map((p) => `${p.arquivo}, ${formatBytes(p.tamanho)}`).join('; ')}).`);
    }
    // Metadados técnicos do ambiente de geração, em arquivo próprio identificado por hash.
    const ambienteDados = {
      schema: 'talkencript/ambiente/1',
      relatorio: id,
      geradoEm: fim.toISOString(),
      ferramenta: { nome: APP.nome, versao: APP.versao, pacote: APP.rotulo, bibliotecas: APP.bibliotecas.map((l) => `${l.nome} ${l.versao}`), codigo },
      navegador: navigator.userAgent,
      marcasNavegador: navigator.userAgentData?.brands?.map((x) => `${x.brand} ${x.version}`) ?? null,
      plataforma: navigator.userAgentData?.platform || navigator.platform || null,
      dispositivoMovel: navigator.userAgentData?.mobile ?? null,
      idiomas: [...(navigator.languages ?? [navigator.language])],
      tela: { largura: screen.width, altura: screen.height, profundidadeCor: screen.colorDepth, escala: window.devicePixelRatio },
      processadores: navigator.hardwareConcurrency ?? null,
      memoriaGB: navigator.deviceMemory ?? null,
      fusoHorario: Intl.DateTimeFormat().resolvedOptions().timeZone,
      deslocamentoUTC: offsetLabel(fim.getTimezoneOffset()),
      horaServidor,
      enderecoExecucao: location.origin + location.pathname,
      protocolo: location.protocol,
      processamentoEmWorker: !workerBroken,
      geolocalizacao: geo,
    };
    const ambienteBytes = new TextEncoder().encode(JSON.stringify(ambienteDados, null, 2) + '\n');
    const metadados = [{ arquivo: names.ambiente, descricao: 'Informações do ambiente de geração', tamanho: ambienteBytes.length, momento: fim.toISOString(), ...(await hashBytes(ambienteBytes, REPORT_ALGOS)) }];
    const nomesInterlocutores = speakers.map((it) => it.nome).filter(Boolean);
    const titulo = $('#caso-titulo').value.trim().replace(/\s+/g, ' ')
      || `Conversa do ${$('#caso-plataforma').value}${nomesInterlocutores.length ? ` - ${joinNames(nomesInterlocutores)}` : ''}`;
    if (credencial) {
      const d = credencial.dados;
      log(`Assinatura digital do relatório em PDF com o certificado ${d.tipo} A1 de ${d.titular}${d.cpf ? `, CPF ${d.cpf}` : ''} (emitido por ${d.emissor}, número de série ${d.numeroSerie}), no padrão PAdES, realizada no navegador do operador.`);
    }
    const data = {
      schema: 'talkencript/relatorio/2',
      id,
      titulo,
      ferramenta: { nome: APP.nome, versao: APP.versao, versaoDescricao: APP.versaoDescricao, pacote: APP.rotulo, criador: APP.criador, bibliotecas: APP.bibliotecas, codigo },
      operador: op,
      declaracao: { texto: $('#declaracao-texto').textContent.trim(), aceitaEm: events[1].momento },
      caso: {
        plataforma: $('#caso-plataforma').value,
        tipoExportacao: tipoEscolhido === 'auto' ? `${hasMedia(result.files) ? 'Com mídia' : 'Sem mídia'} (identificado automaticamente)` : tipoEscolhido,
        versaoAplicativo: $('#caso-versao').value.trim() || null,
        interlocutores: speakers,
        relacaoInterlocutores: $('#caso-relacao').value.trim().replace(/\s+/g, ' ') || null,
        dataConversaInicio: conversaInicio,
        dataConversaFim: conversaFim && conversaFim !== conversaInicio ? conversaFim : null,
        origem: $('#caso-origem').value.trim(),
        imei: imeiMascarado,
        imeiNaoSeAplica: semImei,
        dataExportacao: $('#caso-data').value || null,
        processo: $('#caso-processo').value.trim(),
        finalidade: $('#caso-finalidade').value.trim() || null,
        observacoes: $('#caso-observacoes').value.trim(),
      },
      localInformado: $('#caso-local').value.trim() || null,
      momento: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: offsetLabel(fim.getTimezoneOffset()),
        horaServidor,
        horaServidorMotivo: horaServidor ? null : location.protocol === 'file:' ? 'sistema aberto como arquivo local, sem servidor' : 'sem conexão ou servidor sem cabeçalho Date',
      },
      geolocalizacao: geo,
      endereco,
      ambiente: {
        endereco: location.origin + location.pathname,
        navegador: navigator.userAgent,
        plataforma: navigator.userAgentData?.platform || navigator.platform || 'não informado',
        idioma: navigator.language,
        tela: `${screen.width}x${screen.height}`,
        processamentoLocal: true,
      },
      algoritmos: result.algos.map((a) => ({ nome: a.nome, bits: a.bits, bytes: a.bits / 8, caracteresHex: a.bits / 4, norma: a.norma })),
      arquivos: result.files,
      conversas: result.chats,
      transcricao,
      printsPdf,
      prints: printRecords.map(({ miniatura, miniaturaLargura, miniaturaAltura, ...rest }) => rest),
      metadados,
      assinatura: credencial ? { ...credencial.dados, padrao: 'PAdES (ETSI EN 319 142-1), CAdES destacada, SHA-256 com RSA' } : null,
      eventos: events,
    };
    log(`Relatório nº ${id} gerado.`);

    const jsonText = JSON.stringify(data, null, 2) + '\n';
    const jsonBytes = new TextEncoder().encode(jsonText);
    const jsonSha256 = await sha256Hex(jsonBytes);
    // As miniaturas entram apenas no PDF; o JSON guarda os dados verificáveis.
    const blocks = buildBlocks({ ...data, prints: printRecords }, { jsonSha256 });
    const txt = new TextEncoder().encode(renderText(blocks));
    genProgress.update(90, 'Gerando o relatório em PDF...');
    const cabecalho = cabecalhoTecnico(fim);
    let pdf = new Uint8Array(renderPDF(jsPDF, blocks, { id, verificationCode: jsonSha256, operador: op.nome, cabecalho, simbolo: simboloCor }, fonts));
    if (credencial) {
      genProgress.update(94, 'Assinando o relatório com o certificado digital...');
      pdf = await signPdf(pdf, credencial, {
        motivo: `Relatório ${id} de integridade de conversa eletrônica (${APP.rotulo})`,
        local: data.localInformado || data.endereco?.cidade || undefined,
        contato: op.email || undefined,
      });
    }
    const manifests = buildManifests(data);

    const files = { [names.pdf]: pdf, [names.txt]: txt, [names.json]: jsonBytes, [names.ambiente]: ambienteBytes };
    if (transcricaoBytes) files[names.conversa] = transcricaoBytes;
    Object.assign(files, printsPdfFiles);
    if (manifests.sha256) files[names.sha256] = new TextEncoder().encode(manifests.sha256);
    if (manifests.sha512) files[names.sha512] = new TextEncoder().encode(manifests.sha512);
    if (manifests.sha3_512) files[names.sha3_512] = new TextEncoder().encode(manifests.sha3_512);
    if (manifests.zip) files[names.zip] = new TextEncoder().encode(manifests.zip);
    if (manifests.prints) files[names.prints] = new TextEncoder().encode(manifests.prints);
    genProgress.update(96, 'Montando o pacote completo...');
    // Verificadores incluídos no pacote: página HTML (dois cliques) e scripts para o
    // terminal, com o SHA-256 de cada arquivo registrado.
    const hashesPacote = {};
    for (const [name, bytes] of Object.entries(files)) hashesPacote[name] = await sha256Hex(bytes);
    const itensVerificacao = verificationItems({ pacote: hashesPacote, arquivos: data.arquivos, prints: data.prints ?? [], zipFolderName });
    const rotuloVersao = `${APP.rotulo} (${APP.edicao})`;
    files[names.verificador] = new TextEncoder().encode(buildVerifierHtml({
      id, emitidoEm: `${formatDateTime(data.momento.fim)} (${data.momento.offset})`, operador: op.nome,
      codigoVerificacao: jsonSha256, versao: rotuloVersao, simbolo: pdfSimbolo, itens: itensVerificacao,
      ignorar: [names.verificador, names.pacote, names.scriptSh, names.scriptPs1, names.scriptBat],
    }));
    files[names.scriptSh] = new TextEncoder().encode(buildShellScript({ id, versao: rotuloVersao, itens: itensVerificacao }));
    files[names.scriptPs1] = new TextEncoder().encode(`\ufeff${buildPowerShellScript({ id, versao: rotuloVersao, itens: itensVerificacao })}`);
    files[names.scriptBat] = new TextEncoder().encode(buildBatch());
    let pacote = '';
    for (const [name, bytes] of Object.entries(files)) pacote += manifestLine(await sha256Hex(bytes), name);
    files[names.pacote] = new TextEncoder().encode(pacote);
    // O verificar.sh vai com permissão de execução (rwxr-xr-x), como em um pacote do Linux.
    const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([n, b]) => [`${names.pasta}/${n}`, [b, n === names.scriptSh ? { mtime: fim, os: 3, attrs: (0o100755 << 16) >>> 0 } : { mtime: fim }]])), { level: 6 });

    genProgress.update(100, 'Relatório gerado. Iniciando os downloads...');
    $('#gerar-cancelar').disabled = true;
    await new Promise((r) => setTimeout(r, 700));
    genProgress.hide();
    showResult({ data, names, files, zipped, jsonSha256, pdfSha256: pacote.slice(0, 64) });
  } catch (error) {
    genProgress.hide();
    showError(errorBox, error.message === 'cancelado' ? 'Geração cancelada.' : `Não foi possível gerar o relatório: ${error.message}`);
  } finally {
    running = false;
    $('#gerar').disabled = false;
  }
}

function showResult({ data, names, files, zipped, jsonSha256, pdfSha256 }) {
  const box = $('#resultado');
  const dl = $('#resultado-dados');
  dl.replaceChildren();
  const rows = [
    ['Relatório nº', data.id],
    ['Emitido em', `${formatDateTime(data.momento.fim)} (${data.momento.offset})`],
    ['Operador', data.operador.nome],
    ['Arquivos', `${data.arquivos.length} arquivo(s), ${formatBytes(data.arquivos.reduce((n, f) => n + f.size, 0))}`],
    ['Localização', data.geolocalizacao?.latitude != null ? `${data.geolocalizacao.latitude.toFixed(6)}, ${data.geolocalizacao.longitude.toFixed(6)}` : `não obtida (${data.geolocalizacao?.motivo})`],
    ...(data.geolocalizacao?.latitude != null ? [['Google Maps', (() => {
      const url = googleMapsUrl(data.geolocalizacao.latitude, data.geolocalizacao.longitude);
      return el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', id: 'link-google-maps' }, url);
    })()]] : []),
    ['SHA-256 do PDF', pdfSha256],
  ];
  for (const [k, v] of rows) dl.append(el('dt', {}, k), el('dd', {}, v));
  $('#resultado-codigo').textContent = jsonSha256;

  // Somente o pacote zipado é baixado; o PDF, o TXT, o JSON e os manifestos ficam dentro dele.
  const included = Object.keys(files);
  const status = el('p', { class: 'ajuda', id: 'downloads-status' });
  const downloadZip = () => {
    download(names.zipName, zipped, 'application/zip');
    status.textContent = `Pacote baixado: ${names.zipName}. Ele contém ${included.length} arquivos: ${included.join(', ')}.`;
  };

  const actions = $('#resultado-downloads');
  actions.replaceChildren(
    el('button', { class: 'botao primario grande', id: 'baixar-tudo', onclick: downloadZip }, 'Baixar o pacote novamente'),
    status,
  );
  downloadZip();

  const hashes = $('#resultado-hashes');
  hashes.replaceChildren();
  for (const f of data.arquivos) {
    hashes.append(el('div', { class: 'hashes-arquivo' },
      el('strong', {}, f.path), ' ', el('span', { class: 'ajuda' }, formatBytes(f.size)),
      el('code', {}, `SHA-256: ${f.sha256}`), el('code', {}, `SHA-512: ${f.sha512}`), el('code', {}, `SHA3-512: ${f.sha3_512}`),
      f.zipEntries?.length ? el('details', {}, el('summary', {}, `${f.zipEntries.length} item(ns) no ZIP`),
        ...f.zipEntries.map((e) => el('div', { class: 'hashes-arquivo' }, el('strong', {}, `${zipFolderName(f.path)}/${e.path}`), el('code', {}, `SHA-256: ${e.sha256 ?? e.error}`)))) : null));
  }
  for (const pr of data.prints ?? []) {
    hashes.append(el('div', { class: 'hashes-arquivo' },
      el('strong', {}, `Print: ${pr.path}`), ' ', el('span', { class: 'ajuda' }, `comparação: ${pr.comparacao.situacao}`),
      el('code', {}, `SHA-256: ${pr.sha256}`)));
  }
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// Verificação

let verifyItems = [];
const updateVerifyCount = () => {
  $('#verif-contagem').textContent = verifyItems.length ? `${verifyItems.length} arquivo(s) selecionado(s), ${formatBytes(verifyItems.reduce((n, it) => n + it.file.size, 0))}` : '';
};
for (const id of ['#verif-arquivos', '#verif-pasta']) {
  $(id).addEventListener('change', (e) => { verifyItems = clean(fromInput(e.target)); updateVerifyCount(); });
}

/** Lê o relatório JSON ou o manifesto e devolve a lista de itens esperados. */
async function readReference(file) {
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    throw friendlyReadError(error, file.name);
  }
  const text = new TextDecoder('utf-8').decode(bytes);
  if (/\.json$/i.test(file.name) || text.trimStart().startsWith('{')) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('O arquivo JSON não pôde ser lido. Ele pode ter sido alterado ou corrompido.'); }
    if (!String(data.schema ?? '').startsWith('talkencript/relatorio')) throw new Error('O JSON selecionado não é um relatório do TalkEncript.');
    const expected = [];
    for (const f of data.arquivos ?? []) {
      expected.push({ path: f.path, sha256: f.sha256, sha512: f.sha512, algo: 'sha256', hash: f.sha256 });
      for (const e of f.zipEntries ?? []) if (e.sha256) expected.push({ path: `${zipFolderName(f.path)}/${e.path}`, algo: 'sha256', hash: e.sha256, interno: true });
    }
    for (const pr of data.prints ?? []) expected.push({ path: `Print: ${pr.path}`, nome: pr.path, algo: 'sha256', hash: pr.sha256, interno: true });
    return { kind: 'relatorio', data, seal: await sha256Hex(bytes), expected };
  }
  const parsed = parseManifest(text);
  if (!parsed.entries.length) throw new Error('Nenhuma linha de hash reconhecida no manifesto.');
  const expected = parsed.entries.map((e) => ({ path: e.path, algo: detectAlgorithm(e.hash), hash: e.hash }));
  return { kind: 'manifesto', invalid: parsed.invalid, expected, seal: await sha256Hex(bytes) };
}

$('#verificar').addEventListener('click', async () => {
  const errorBox = $('#verif-erro');
  const progress = $('#verif-progresso');
  const out = $('#verif-resultado');
  showError(errorBox, null);
  out.hidden = true;
  const refFile = $('#verif-referencia').files[0];
  if (!refFile) { showError(errorBox, 'Selecione o relatório (.json) ou o manifesto.'); return; }
  if (!verifyItems.length) { showError(errorBox, 'Selecione os arquivos a conferir.'); return; }
  try {
    const ref = await readReference(refFile);
    const algos = [...new Set(ref.expected.map((e) => e.algo).filter(Boolean))];
    const result = await runWorker(verifyItems.map(({ file, path }) => ({ file, path })), { zip: true, chat: false, algos }, (f, m) => setProgress(progress, f, m));
    progress.hidden = true;

    // Índice de hashes calculados: arquivo inteiro e itens internos dos ZIPs.
    const found = new Map();
    const add = (algo, hash, path) => { if (!hash) return; const key = `${algo}:${hash}`; if (!found.has(key)) found.set(key, []); found.get(key).push(path); };
    const computedByName = new Map();
    for (const f of result.files) {
      for (const a of algos) add(a, f[a], f.path);
      computedByName.set(f.path.split('/').pop(), f);
      for (const e of f.zipEntries ?? []) {
        const p = `${zipFolderName(f.path)}/${e.path}`;
        for (const a of algos) add(a, e[a], p);
        computedByName.set(e.path.split('/').pop(), e);
      }
    }

    const rows = ref.expected.map((exp) => {
      const hits = found.get(`${exp.algo}:${exp.hash}`);
      if (hits) return { exp, status: 'ok', detail: hits[0] === exp.path ? 'conteúdo idêntico' : `conteúdo idêntico em ${hits[0]}` };
      const same = computedByName.get((exp.nome ?? exp.path).split('/').pop());
      if (same) return { exp, status: 'falha', detail: `ALTERADO: hash calculado ${same[exp.algo] ?? same.error}` };
      return { exp, status: 'alerta', detail: 'não apresentado para conferência' };
    });
    renderVerification(out, ref, rows);
  } catch (error) {
    progress.hidden = true;
    showError(errorBox, error.message === 'cancelado' ? 'Verificação cancelada.' : error.message);
  }
});

function renderVerification(out, ref, rows) {
  out.replaceChildren();
  const ok = rows.filter((r) => r.status === 'ok').length;
  const changed = rows.filter((r) => r.status === 'falha').length;
  const absent = rows.filter((r) => r.status === 'alerta').length;

  if (ref.kind === 'relatorio') {
    const d = ref.data;
    const dl = el('dl', { class: 'dados' });
    for (const [k, v] of [
      ['Relatório nº', d.id],
      ['Emitido em', `${formatDateTime(d.momento?.fim)} (${d.momento?.offset ?? ''})`],
      ['Operador', `${d.operador?.nome ?? ''}${d.operador?.oab ? `, ${d.operador.oab}` : ''}`],
      ['Código de verificação calculado', ref.seal],
    ]) dl.append(el('dt', {}, k), el('dd', {}, v));
    out.append(dl, el('p', { class: 'ajuda' }, 'Compare o código de verificação acima com o impresso no PDF do relatório. Se forem iguais, o arquivo JSON não foi alterado desde a emissão.'));
  } else if (ref.invalid?.length) {
    out.append(el('p', { class: 'ajuda' }, `Linhas ignoradas por formato não reconhecido: ${ref.invalid.join(', ')}.`));
  }

  const internal = rows.filter((r) => r.exp.interno);
  const main = rows.filter((r) => !r.exp.interno);
  const mainOk = main.every((r) => r.status === 'ok');
  const verdict = changed
    ? el('div', { class: 'veredito falha' }, `Foram encontradas ${changed} divergência(s). Ao menos um arquivo foi alterado em relação ao registrado.`)
    : mainOk || (internal.length && internal.every((r) => r.status === 'ok'))
      ? el('div', { class: 'veredito ok' }, `Íntegro: ${ok} item(ns) conferem exatamente com o registro.${absent ? ` ${absent} item(ns) não foram apresentados.` : ''}`)
      : el('div', { class: 'veredito falha' }, `Nenhuma divergência de conteúdo, mas ${absent} item(ns) não foram apresentados para conferência.`);
  out.append(verdict);

  const table = el('table', { class: 'tabela' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Situação'), el('th', {}, 'Item registrado'), el('th', {}, 'Detalhe'))),
    el('tbody', {}, rows.map((r) => el('tr', {},
      el('td', {}, el('span', { class: `selo ${r.status}` }, r.status === 'ok' ? 'Íntegro' : r.status === 'falha' ? 'Alterado' : 'Ausente')),
      el('td', {}, r.exp.path, el('br'), el('code', { class: 'ajuda' }, `${ALGORITHMS[r.exp.algo]?.label ?? ''} ${r.exp.hash}`)),
      el('td', {}, r.detail)))));
  out.append(el('div', { class: 'tabela-rolagem' }, table));
  out.hidden = false;
}

// Comparação de um arquivo com um hash
const singleHash = $('#unico-hash');
singleHash.addEventListener('input', () => {
  const algo = detectAlgorithm(singleHash.value);
  $('#unico-algoritmo').textContent = singleHash.value.trim() ? (algo ? `Algoritmo identificado: ${algo === 'sha512' ? 'SHA-512 ou SHA3-512 (os dois são calculados)' : ALGORITHMS[algo].label}` : 'Hash inválido: confira se foi copiado por inteiro.') : '';
});

$('#unico-comparar').addEventListener('click', async () => {
  const out = $('#unico-resultado');
  const file = $('#unico-arquivo').files[0];
  const algo = detectAlgorithm(singleHash.value);
  out.hidden = false;
  if (!file || !algo) {
    out.replaceChildren(el('div', { class: 'erro-caixa' }, !file ? 'Selecione o arquivo.' : 'Informe um hash válido.'));
    return;
  }
  out.replaceChildren(el('p', { class: 'ajuda' }, 'Calculando...'));
  try {
    // Com 128 caracteres, o hash pode ser SHA-512 ou SHA3-512: calcula os dois.
    const algos = algo === 'sha512' ? ['sha512', 'sha3_512'] : [algo];
    const result = await runWorker([{ file, path: file.name }], { zip: false, chat: false, algos });
    const expected = normalizeHex(singleHash.value);
    const match = algos.find((a) => result.files[0][a] === expected);
    const shown = match ?? algos[0];
    out.replaceChildren(
      el('div', { class: `veredito ${match ? 'ok' : 'falha'}` }, match ? 'Os hashes são idênticos: o arquivo é íntegro.' : 'Os hashes são diferentes: o arquivo não corresponde ao hash informado.'),
      el('div', { class: 'hashes-arquivo' }, el('strong', {}, `${file.name} (${ALGORITHMS[shown].label})`), el('code', {}, `Esperado:  ${expected}`),
        ...algos.map((a) => el('code', {}, `Calculado (${ALGORITHMS[a].label}): ${result.files[0][a]}`))),
    );
  } catch (error) {
    out.replaceChildren(el('div', { class: 'erro-caixa' }, error.message));
  }
});

// ---------------------------------------------------------------------------
// Inicialização

$('#versao').textContent = APP.versaoDescricao;
requireLocationAtStart();
if (BUNDLE) $('#baixar-offline').hidden = true;
fillOperatorForm(operator);
renderOperator();
showTab(operator ? 'gerar' : 'operador');
