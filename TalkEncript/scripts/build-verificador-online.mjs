// Monta a página pública de verificação (validador online do QR code do relatório):
// verificador-online/index.html, um arquivo único com todo o código embutido.
// Publicação: copiar a pasta verificador-online para o repositório público
// oliveiracarlosadv/TalkEncript-Verificar (GitHub Pages, pasta raiz do branch main).
// Uso: npm run build:verificador   (requer esbuild)

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p));
const code = (await build({
  entryPoints: [join(root, 'js/verificador-online.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const simbolo = read('img/simbolo-branco.png').toString('base64');
const favicon = read('img/favicon.png').toString('base64');

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>Verificar relatório - TalkEncript</title>
<link rel="icon" href="data:image/png;base64,${favicon}" type="image/png">
<style>
:root { --verde: #556b2f; --claro: #eef1e6; --texto: #15191f; --suave: #5d6673; --borda: #d8dde4; --ok: #1d7a3e; --okf: #e5f5ec; --falha: #b42318; --falhaf: #fdecea; --aviso: #8a5a00; --avisof: #fff4dc; --fundo: #f4f6f9; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: var(--texto); background: var(--fundo); }
.faixa { background: var(--verde); color: #fff; padding: 12px 16px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.faixa strong { font-size: 1.15rem; }
.faixa span { opacity: .92; }
.faixa img { height: 30px; }
main { max-width: 980px; margin: 0 auto; padding: 20px 16px 48px; }
.cartao { background: #fff; border: 1px solid var(--borda); border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
h1 { font-size: 1.35rem; margin: 0 0 6px; }
h2 { font-size: 1.1rem; margin: 0 0 10px; color: var(--verde); }
p { margin: 6px 0; }
.dados { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 10px 0 0; }
.dados dt { font-weight: 700; }
.dados dd { margin: 0; overflow-wrap: anywhere; }
.hash { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .82rem; overflow-wrap: anywhere; }
.zona { border: 2px dashed var(--verde); border-radius: 10px; padding: 26px 16px; text-align: center; background: var(--claro); }
.zona.ativa { background: #e0e8cf; }
.botao { display: inline-block; margin: 10px 6px 0; padding: 9px 16px; border-radius: 8px; border: 1px solid var(--verde); background: var(--verde); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
.botao.secundario { background: #fff; color: var(--verde); }
.veredito { border-radius: 10px; padding: 14px 18px; font-weight: 700; margin-bottom: 12px; }
.veredito.ok { background: var(--okf); color: var(--ok); }
.veredito.falha { background: var(--falhaf); color: var(--falha); }
.veredito.aviso { background: var(--avisof); color: var(--aviso); }
.rolagem { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .93rem; }
th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--borda); vertical-align: top; }
th { color: var(--suave); font-weight: 600; }
td { overflow-wrap: anywhere; }
.selo { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: .8rem; font-weight: 700; white-space: nowrap; }
.selo.ok { background: var(--okf); color: var(--ok); }
.selo.falha { background: var(--falhaf); color: var(--falha); }
.selo.aviso { background: var(--avisof); color: var(--aviso); }
.selo.pendente { background: #eef0f3; color: var(--suave); }
.progresso { height: 8px; background: #e6e9ee; border-radius: 4px; overflow: hidden; margin-top: 12px; }
.progresso div { height: 100%; width: 0; background: var(--verde); transition: width .2s; }
small, .suave { color: var(--suave); }
@media (max-width: 560px) { .dados { grid-template-columns: 1fr; } .dados dt { margin-top: 6px; } }
@media print { .nao-imprimir { display: none !important; } body { background: #fff; } .cartao { break-inside: avoid; } }
</style>
</head>
<body>
<div class="faixa"><img src="data:image/png;base64,${simbolo}" alt=""><strong>TalkEncript</strong><span>Verificação de relatórios de integridade de conversas</span></div>
<main>
  <div class="cartao">
    <h1>Verificar um relatório do TalkEncript</h1>
    <p>Esta página confere se o relatório e os arquivos que você recebeu são idênticos aos registrados no momento da geração. A conferência é feita <strong>no seu navegador</strong>: nenhum arquivo é enviado pela internet.</p>
    <div id="dados-relatorio"></div>
  </div>
  <div class="cartao nao-imprimir">
    <h2>Como conferir</h2>
    <p>1. Arraste para o quadro o <strong>pacote do relatório</strong> (o arquivo ZIP "Relatório Hash_..." ou a pasta extraída) e os <strong>arquivos da conversa</strong> (por exemplo, o ZIP exportado do WhatsApp) e os prints.</p>
    <p>2. A página confere o arquivo de dados do relatório com o código de verificação do QR code e cada arquivo com os códigos hash registrados (SHA-256 e SHA3-512).</p>
    <p>3. A assinatura digital do relatório em PDF deve ser conferida no validador oficial do ITI: <a href="https://validar.iti.gov.br" target="_blank" rel="noopener noreferrer">validar.iti.gov.br</a>.</p>
    <div id="zona" class="zona" tabindex="0">
      <strong>Arraste aqui o pacote do relatório e os arquivos</strong><br>
      <button type="button" class="botao" id="btn-arquivos">Selecionar arquivos</button>
      <button type="button" class="botao secundario" id="btn-pasta">Selecionar pasta</button>
      <input type="file" id="entrada-arquivos" multiple hidden>
      <input type="file" id="entrada-pasta" webkitdirectory multiple hidden>
      <div class="progresso" id="progresso" hidden><div></div></div>
      <small id="status"></small>
    </div>
  </div>
  <div id="veredito"></div>
  <div class="cartao" id="resultado" hidden>
    <h2>Arquivos conferidos</h2>
    <div class="rolagem"><table><thead><tr><th>Situação</th><th>Arquivo</th><th>Detalhe</th></tr></thead><tbody id="linhas"></tbody></table></div>
    <button type="button" class="botao secundario nao-imprimir" id="btn-imprimir">Imprimir ou salvar o resultado em PDF</button>
  </div>
  <div class="cartao" id="registrados-cartao" hidden>
    <h2>Arquivos registrados no relatório</h2>
    <div class="rolagem"><table><thead><tr><th>Situação</th><th>Arquivo</th><th>SHA-256 registrado</th></tr></thead><tbody id="registrados"></tbody></table></div>
  </div>
  <p><small>TalkEncript, criado por Carlos Alexandre Albuquerque Oliveira, advogado, OAB/PA 33.996. Os códigos são calculados nesta página pelos algoritmos SHA-256 (FIPS 180-4) e SHA3-512 (FIPS 202) e podem ser confirmados por qualquer outra ferramenta, como shasum -a 256 (macOS), sha256sum (Linux), Get-FileHash (Windows) ou openssl dgst -sha3-512.</small></p>
</main>
<script>${code}</script>
</body>
</html>
`;
const outDir = join(root, 'verificador-online');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
writeFileSync(join(outDir, '.nojekyll'), '');
console.log(`${join(outDir, 'index.html')} (${(html.length / 1e3).toFixed(0)} KB) SHA-256: ${createHash('sha256').update(html).digest('hex')}`);
