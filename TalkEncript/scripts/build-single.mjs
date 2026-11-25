// Monta TalkEncript.html (o arquivo para executar o aplicativo): um único arquivo, com todo o código, as fontes e o
// worker embutidos, que abre com dois cliques em qualquer navegador, sem servidor.
// Uso: npm run build   (requer esbuild)

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { zipSync } from '../vendor/fflate.esm.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

const bundle = async (entry) => (await build({
  entryPoints: [join(root, entry)], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none',
})).outputFiles[0].text;

const SOURCES = ['codigo-fonte.html', 'css/style.css', 'js/app.js', 'js/worker.js', 'js/jobs.js', 'js/hashing.js', 'js/report.js', 'js/pdf.js', 'js/chat.js', 'js/compare.js', 'js/address.js', 'js/transcript.js', 'js/validators.js', 'js/cabecalho.js', 'js/justify.js', 'js/prints-pdf.js', 'vendor/pdf-lib.esm.min.js', 'vendor/hash-wasm.esm.min.js', 'vendor/fflate.esm.js', 'vendor/jspdf.umd.min.js', 'js/assinatura.js', 'vendor/forge.esm.js', 'vendor/qrcode-generator.esm.js'];

const [appCode, workerCode] = await Promise.all([bundle('js/app.js'), bundle('js/worker.js')]);
const fonts = Object.fromEntries([['regular', 'LiberationSans-Regular.ttf'], ['bold', 'LiberationSans-Bold.ttf']]
  .map(([k, f]) => [k, read(`vendor/fonts/${f}`).toString('base64')]));
const meta = {
  workerCode,
  fonts,
  simbolo: read('img/simbolo-branco.png').toString('base64'),
  simboloCor: read('img/simbolo.png').toString('base64'),
  codigo: SOURCES.map((arquivo) => ({ arquivo, sha256: sha256(read(arquivo)) })),
};
const safe = (code) => code.replace(/<\/script/gi, '<\\/script');
// Símbolo do sistema (ramo de oliveira) e favicon, embutidos no próprio arquivo.
const simbolo = `data:image/png;base64,${read('img/simbolo.png').toString('base64')}`;
const favicon = `data:image/png;base64,${read('img/favicon.png').toString('base64')}`;

let html = read('codigo-fonte.html').toString('utf8');
html = html
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'self' blob: data: https://nominatim.openstreetmap.org https://photon.komoot.io https://overpass-api.de; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'">`)
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${favicon}" type="image/png">`)
  .replace(/<link rel="stylesheet" href="css\/style.css">/, () => `<style>\n${read('css/style.css')}</style>`)
  .replace(/src="img\/simbolo.png"/g, `src="${simbolo}"`)
  .replace(/<script type="module" src="js\/app.js"><\/script>/, () => [
    `<script>window.__TALKENCRIPT__=${safe(JSON.stringify(meta))};</script>`,
    `<script>${safe(read('vendor/jspdf.umd.min.js').toString('utf8'))}</script>`,
    `<script>${safe(appCode)}</script>`,
  ].join('\n'));

const out = join(root, 'TalkEncript.html');
writeFileSync(out, html);
const hash = sha256(html);
writeFileSync(join(root, 'TalkEncript.html.sha256'), `${hash} *TalkEncript.html\n`);
console.log(`${out} (${(html.length / 1e6).toFixed(1)} MB)\nSHA-256: ${hash}`);

// Pacote de download: "GestorLaw - TalkEncript V 2.1.zip", com data fixa nos
// itens para que o mesmo conteúdo gere sempre o mesmo arquivo.
const PACOTE = 'GestorLaw - TalkEncript V 2.1';
const mtime = new Date('2026-10-30T12:00:00Z');
const leiame = `${PACOTE} (segunda versão)
Criado por Carlos Alexandre Albuquerque Oliveira, advogado, OAB/PA 33.996.

SOBRE O CRIADOR
O GestorLaw - TalkEncript foi criado por Carlos Alexandre Albuquerque Oliveira, advogado (OAB/PA 33.996), especialista em Direito Penal e Criminologia, em Direito Penal e Processo Penal e em Direito e Processo do Trabalho, ex-servidor público com experiência em cadeia de custódia e transferência de provas, que atua nas áreas cível, trabalhista e penal, com ênfase em compliance.
Currículo Lattes: https://lattes.cnpq.br/4151018791454248
ORCID: https://orcid.org/0000-0003-0680-4424

COMO USAR
Extraia este pacote em uma pasta do computador e dê dois cliques no arquivo
TalkEncript.html. O aplicativo abre no navegador (Chrome, Edge, Firefox ou
Safari), em Windows, macOS ou Linux, sem instalação. Ao abrir, autorize o
acesso à localização: ela é obrigatória e precisa ser precisa (raio de até
100 metros). Faça o cadastro do operador e, na aba Gerar relatório, envie a
conversa exportada.

COMO TESTAR
A pasta exemplos contém uma conversa fictícia exportada do WhatsApp, com uma
foto, e um print dessa conversa. Para teste, use o CPF fictício
529.982.247-25 e o IMEI fictício 490154203237518.

CONFERÊNCIA DO APLICATIVO
O arquivo TalkEncript.html.sha256 contém o SHA-256 do aplicativo. Para
conferir que a cópia é original, execute na pasta do pacote:
  macOS:   shasum -a 256 -c TalkEncript.html.sha256
  Linux:   sha256sum -c TalkEncript.html.sha256
  Windows: Get-FileHash -Algorithm SHA256 TalkEncript.html
e compare com o valor do arquivo TalkEncript.html.sha256.
SHA-256 desta versão: ${hash}
`;
const entries = {
  [`${PACOTE}/TalkEncript.html`]: [new TextEncoder().encode(html), { mtime }],
  [`${PACOTE}/TalkEncript.html.sha256`]: [new TextEncoder().encode(`${hash} *TalkEncript.html\n`), { mtime }],
  [`${PACOTE}/LEIA-ME.txt`]: [new TextEncoder().encode(leiame.replace(/\n/g, '\r\n')), { mtime }],
};
for (const f of readdirSync(join(root, 'exemplos')).sort()) entries[`${PACOTE}/exemplos/${f}`] = [new Uint8Array(read(`exemplos/${f}`)), { mtime }];
const zipOut = join(root, `${PACOTE}.zip`);
writeFileSync(zipOut, zipSync(entries, { level: 9 }));
console.log(`${zipOut}`);
