// Página de verificação incluída no pacote do relatório: um arquivo HTML autônomo, que
// abre com dois cliques em qualquer navegador, sem internet e sem o TalkEncript, e
// confere o SHA-256 dos arquivos arrastados para ela com os valores registrados no
// relatório (arquivos da conversa, itens do ZIP, prints e arquivos do próprio pacote).

// SHA-256 incremental (FIPS 180-4) em JavaScript puro, para funcionar também quando o
// navegador não libera a Web Crypto em arquivos abertos do computador.
export const SHA256_SOURCE = String.raw`function createSha256() {
  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  var H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  var W = new Uint32Array(64);
  var buf = new Uint8Array(64);
  var bufLen = 0;
  var total = 0;
  function block(b, o) {
    var i;
    for (i = 0; i < 16; i++) W[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
    for (i = 16; i < 64; i++) {
      var x = W[i - 15], y = W[i - 2];
      var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 64; i++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return {
    update: function (data) {
      var i = 0;
      total += data.length;
      if (bufLen) {
        while (bufLen < 64 && i < data.length) buf[bufLen++] = data[i++];
        if (bufLen === 64) { block(buf, 0); bufLen = 0; }
      }
      for (; i + 64 <= data.length; i += 64) block(data, i);
      while (i < data.length) buf[bufLen++] = data[i++];
    },
    digest: function () {
      var bits = total * 8;
      buf[bufLen++] = 0x80;
      if (bufLen > 56) { while (bufLen < 64) buf[bufLen++] = 0; block(buf, 0); bufLen = 0; }
      while (bufLen < 56) buf[bufLen++] = 0;
      var hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
      buf[56] = hi >>> 24; buf[57] = hi >>> 16; buf[58] = hi >>> 8; buf[59] = hi;
      buf[60] = lo >>> 24; buf[61] = lo >>> 16; buf[62] = lo >>> 8; buf[63] = lo;
      block(buf, 0);
      var out = '';
      for (var k = 0; k < 8; k++) out += ('00000000' + H[k].toString(16)).slice(-8);
      return out;
    }
  };
}`;

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param info { id, emitidoEm, operador, codigoVerificacao, versao, simbolo (PNG em base64, opcional),
 *               itens: [{ grupo, caminho, tamanho, sha256 }], ignorar: [nomes de arquivos do pacote que não são conferidos] }
 * @returns texto HTML da página de verificação
 */
export function buildVerifierHtml(info) {
  const dados = JSON.stringify({ id: info.id, itens: info.itens, ignorar: info.ignorar ?? [] }).replace(/</g, '\\u003c');
  const simbolo = info.simbolo ? `<img src="data:image/png;base64,${info.simbolo}" alt="" class="simbolo">` : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>Verificar integridade - Relatório ${escapeHtml(info.id)}</title>
<style>
:root { --verde: #556b2f; --claro: #eef1e6; --texto: #15191f; --suave: #5d6673; --borda: #d8dde4; --ok: #1d7a3e; --okf: #e5f5ec; --falha: #b42318; --falhaf: #fdecea; --aviso: #8a5a00; --avisof: #fff4dc; --fundo: #f4f6f9; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: var(--texto); background: var(--fundo); }
.faixa { background: var(--verde); color: #fff; padding: 12px 20px; display: flex; align-items: center; gap: 14px; }
.faixa strong { font-size: 1.1rem; letter-spacing: 0.3px; }
.faixa span { opacity: 0.9; }
.simbolo { height: 30px; }
main { max-width: 980px; margin: 0 auto; padding: 20px 16px 48px; }
.cartao { background: #fff; border: 1px solid var(--borda); border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
h1 { font-size: 1.35rem; margin: 0 0 6px; }
h2 { font-size: 1.1rem; margin: 0 0 10px; color: var(--verde); }
p { margin: 6px 0; text-align: justify; }
.dados { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 10px 0 0; }
.dados dt { font-weight: 700; }
.dados dd { margin: 0; word-break: break-all; }
.zona { border: 2px dashed var(--verde); border-radius: 10px; padding: 26px; text-align: center; background: var(--claro); }
.zona.ativa { background: #e0e8cf; }
.botao { display: inline-block; margin: 10px 6px 0; padding: 9px 16px; border-radius: 8px; border: 1px solid var(--verde); background: var(--verde); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
.botao.secundario { background: #fff; color: var(--verde); }
.veredito { border-radius: 10px; padding: 14px 18px; font-weight: 700; font-size: 1.05rem; margin-bottom: 16px; }
.veredito.ok { background: var(--okf); color: var(--ok); }
.veredito.falha { background: var(--falhaf); color: var(--falha); }
.veredito.aviso { background: var(--avisof); color: var(--aviso); }
table { width: 100%; border-collapse: collapse; font-size: 0.93rem; }
th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--borda); vertical-align: top; }
th { color: var(--suave); font-weight: 600; }
td.hash { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.8rem; word-break: break-all; }
.selo { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.8rem; font-weight: 700; white-space: nowrap; }
.selo.ok { background: var(--okf); color: var(--ok); }
.selo.falha { background: var(--falhaf); color: var(--falha); }
.selo.aviso { background: var(--avisof); color: var(--aviso); }
.selo.pendente { background: #eef0f3; color: var(--suave); }
.progresso { height: 8px; background: #e6e9ee; border-radius: 4px; overflow: hidden; margin-top: 12px; }
.progresso div { height: 100%; width: 0; background: var(--verde); transition: width 0.2s; }
small { color: var(--suave); }
.acoes-exportar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.so-impressao { display: none; }
/* Exportação em PDF pela impressão do navegador ("Salvar como PDF"): sem a área de
   seleção nem os botões, com as cores e a faixa preservadas. */
@media print {
  @page { size: A4; margin: 14mm 12mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { background: #fff; font-size: 11px; }
  main { max-width: none; padding: 0; }
  .nao-imprimir { display: none !important; }
  .so-impressao { display: block; }
  .cartao { border-color: #c9cfd6; break-inside: avoid; }
  tr { break-inside: avoid; }
}
</style>
</head>
<body>
<div class="faixa">${simbolo}<strong>TALK ENCRIPT</strong><span>Verificação de integridade</span></div>
<main>
  <div class="cartao">
    <h1>Verificação de integridade do Relatório nº ${escapeHtml(info.id)}</h1>
    <p>Esta página confere, no próprio computador, sem internet e sem o TalkEncript, se os arquivos apresentados são idênticos aos registrados no relatório. Para cada arquivo, ela calcula o SHA-256 e o compara com o valor registrado. Nenhum arquivo é enviado para fora do computador.</p>
    <dl class="dados">
      <dt>Relatório nº</dt><dd>${escapeHtml(info.id)}</dd>
      <dt>Emitido em</dt><dd>${escapeHtml(info.emitidoEm)}</dd>
      <dt>Operador</dt><dd>${escapeHtml(info.operador)}</dd>
      <dt>Código de verificação</dt><dd>${escapeHtml(info.codigoVerificacao)}</dd>
    </dl>
  </div>

  <div class="cartao nao-imprimir">
    <h2>Como conferir</h2>
    <p>1. Arraste para o quadro abaixo os arquivos a conferir: o arquivo exportado da conversa (por exemplo, o ZIP do WhatsApp), os prints e, se quiser, os arquivos deste pacote. Também é possível selecionar uma pasta inteira.</p>
    <p>2. Cada arquivo aparece como <strong>Íntegro</strong> (idêntico ao registrado), <strong>Alterado</strong> (mesmo nome, conteúdo diferente) ou <strong>Não registrado</strong> (não consta do relatório). A lista ao final mostra o que ainda não foi apresentado.</p>
    <div id="zona" class="zona" tabindex="0">
      <strong>Arraste aqui os arquivos ou a pasta</strong><br>
      <button type="button" class="botao" id="btn-arquivos">Selecionar arquivos</button>
      <button type="button" class="botao secundario" id="btn-pasta">Selecionar pasta</button>
      <input type="file" id="entrada-arquivos" multiple hidden>
      <input type="file" id="entrada-pasta" webkitdirectory multiple hidden>
      <div class="progresso" id="progresso" hidden><div></div></div>
      <small id="status"></small>
    </div>
  </div>

  <div class="acoes-exportar nao-imprimir">
    <small>Depois da conferência, exporte o resultado em PDF para juntar aos autos ou arquivar.</small>
    <button type="button" class="botao" id="btn-exportar">Exportar em PDF</button>
  </div>
  <div class="cartao so-impressao" id="dados-conferencia"></div>
  <div id="veredito"></div>

  <div class="cartao" id="resultado" hidden>
    <h2>Arquivos conferidos</h2>
    <table><thead><tr><th>Situação</th><th>Arquivo</th><th>Detalhe</th></tr></thead><tbody id="linhas"></tbody></table>
  </div>

  <div class="cartao">
    <h2>Arquivos registrados no relatório</h2>
    <table><thead><tr><th>Situação</th><th>Arquivo</th><th>SHA-256 registrado</th></tr></thead><tbody id="registrados"></tbody></table>
  </div>

  <p><small>Página gerada pelo ${escapeHtml(info.versao)}. O SHA-256 é calculado nesta página pelo algoritmo da norma FIPS 180-4; o resultado pode ser confirmado por qualquer outra ferramenta, como o comando shasum -a 256 (macOS), sha256sum (Linux) ou Get-FileHash (Windows).</small></p>
</main>
<script>
${SHA256_SOURCE}
(function () {
  var DADOS = ${dados};
  var itens = DADOS.itens;
  var porHash = {};
  itens.forEach(function (it, i) { (porHash[it.sha256] = porHash[it.sha256] || []).push(i); });
  var estado = itens.map(function () { return null; });
  var nome = function (p) { return String(p).split(/[\\\\/]/).pop().split(' > ').pop(); };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var grupos = {};
  itens.forEach(function (it) { grupos[it.grupo] = true; });

  function renderRegistrados() {
    var html = '';
    Object.keys(grupos).forEach(function (g) {
      html += '<tr><th colspan="3">' + esc(g) + '</th></tr>';
      itens.forEach(function (it, i) {
        if (it.grupo !== g) return;
        var e = estado[i];
        var selo = e === 'ok' ? '<span class="selo ok">Íntegro</span>' : e === 'falha' ? '<span class="selo falha">Alterado</span>' : '<span class="selo pendente">Não apresentado</span>';
        html += '<tr><td>' + selo + '</td><td>' + esc(it.caminho) + '</td><td class="hash">' + it.sha256 + '</td></tr>';
      });
    });
    $('registrados').innerHTML = html;
  }

  function veredito(conferidos) {
    var ok = conferidos.filter(function (c) { return c.situacao === 'ok'; }).length;
    var falha = conferidos.filter(function (c) { return c.situacao === 'falha'; }).length;
    var fora = conferidos.length - ok - falha;
    var classe = falha ? 'falha' : fora ? 'aviso' : 'ok';
    var texto = falha
      ? falha + ' arquivo(s) ALTERADO(S): o conteúdo não corresponde ao registrado no relatório.'
      : ok + ' arquivo(s) ÍNTEGRO(S): idêntico(s) ao registrado no relatório.' + (fora ? ' ' + fora + ' arquivo(s) não consta(m) do relatório.' : '');
    $('veredito').innerHTML = '<div class="veredito ' + classe + '">' + esc(texto) + '</div>';
  }

  var conferidos = [];
  function hashFile(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var sha = createSha256();
      var CHUNK = 4 * 1024 * 1024;
      var offset = 0;
      function next() {
        if (offset >= file.size) { resolve(sha.digest()); return; }
        var reader = new FileReader();
        reader.onload = function () {
          sha.update(new Uint8Array(reader.result));
          offset += CHUNK;
          onProgress(Math.min(offset, file.size));
          setTimeout(next, 0);
        };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsArrayBuffer(file.slice(offset, offset + CHUNK));
      }
      next();
    });
  }

  async function processar(files) {
    // Arquivos ocultos, esta própria página e o manifesto do pacote não entram na conferência.
    files = Array.prototype.filter.call(files, function (f) { return !/^\\./.test(f.name) && DADOS.ignorar.indexOf(f.name) < 0; });
    if (!files.length) return;
    var total = files.reduce(function (n, f) { return n + f.size; }, 0) || 1;
    var feito = 0;
    $('progresso').hidden = false;
    $('resultado').hidden = false;
    for (var k = 0; k < files.length; k++) {
      var f = files[k];
      $('status').textContent = 'Calculando o SHA-256 de ' + f.name + '...';
      var base = feito;
      var hash;
      try {
        hash = await hashFile(f, function (n) { $('progresso').firstChild.style.width = (100 * (base + n) / total).toFixed(1) + '%'; });
      } catch (err) {
        conferidos.push({ situacao: 'aviso', nome: f.name, detalhe: 'não foi possível ler o arquivo' });
        continue;
      }
      feito += f.size;
      var idx = porHash[hash];
      var c;
      if (idx) {
        idx.forEach(function (i) { estado[i] = 'ok'; });
        c = { situacao: 'ok', nome: f.webkitRelativePath || f.name, detalhe: 'idêntico a ' + itens[idx[0]].caminho + ' (' + itens[idx[0]].grupo + ')' };
      } else {
        var mesmoNome = [];
        itens.forEach(function (it, i) { if (nome(it.caminho) === f.name) mesmoNome.push(i); });
        if (mesmoNome.length) {
          mesmoNome.forEach(function (i) { if (estado[i] !== 'ok') estado[i] = 'falha'; });
          c = { situacao: 'falha', nome: f.webkitRelativePath || f.name, detalhe: 'ALTERADO: SHA-256 calculado ' + hash + ', diferente do registrado' };
        } else {
          c = { situacao: 'aviso', nome: f.webkitRelativePath || f.name, detalhe: 'não consta do relatório (SHA-256 ' + hash + ')' };
        }
      }
      conferidos.push(c);
      var selo = c.situacao === 'ok' ? '<span class="selo ok">Íntegro</span>' : c.situacao === 'falha' ? '<span class="selo falha">Alterado</span>' : '<span class="selo aviso">Não registrado</span>';
      $('linhas').insertAdjacentHTML('beforeend', '<tr><td>' + selo + '</td><td>' + esc(c.nome) + '</td><td>' + esc(c.detalhe) + '</td></tr>');
      renderRegistrados();
      veredito(conferidos);
    }
    $('progresso').firstChild.style.width = '100%';
    $('status').textContent = 'Conferência concluída: ' + conferidos.length + ' arquivo(s).';
  }

  // Exportar em PDF: registra a data e a hora da conferência e abre a impressão do
  // navegador, em que se escolhe "Salvar como PDF" como destino.
  $('btn-exportar').onclick = function () {
    var agora = new Date();
    var ok = conferidos.filter(function (c) { return c.situacao === 'ok'; }).length;
    var falha = conferidos.filter(function (c) { return c.situacao === 'falha'; }).length;
    $('dados-conferencia').innerHTML = '<h2>Resultado da conferência</h2><dl class="dados">' +
      '<dt>Conferência realizada em</dt><dd>' + esc(agora.toLocaleString('pt-BR')) + ' (' + esc(Intl.DateTimeFormat().resolvedOptions().timeZone || '') + ')</dd>' +
      '<dt>Arquivos conferidos</dt><dd>' + conferidos.length + ' (' + ok + ' íntegro(s), ' + falha + ' alterado(s), ' + (conferidos.length - ok - falha) + ' não registrado(s))</dd>' +
      '<dt>Método</dt><dd>SHA-256 (FIPS 180-4), calculado nesta página, sem internet</dd></dl>' +
      (conferidos.length ? '' : '<p>Nenhum arquivo foi conferido antes da exportação.</p>');
    var titulo = document.title;
    document.title = 'Conferência de integridade - Relatório ' + DADOS.id;
    window.print();
    setTimeout(function () { document.title = titulo; }, 1000);
  };

  $('btn-arquivos').onclick = function () { $('entrada-arquivos').click(); };
  $('btn-pasta').onclick = function () { $('entrada-pasta').click(); };
  $('entrada-arquivos').onchange = function (e) { processar(e.target.files); e.target.value = ''; };
  $('entrada-pasta').onchange = function (e) { processar(e.target.files); e.target.value = ''; };

  function lerEntrada(entry, lista) {
    return new Promise(function (resolve) {
      if (entry.isFile) { entry.file(function (f) { lista.push(f); resolve(); }, function () { resolve(); }); return; }
      if (!entry.isDirectory) { resolve(); return; }
      var reader = entry.createReader();
      var todos = [];
      (function ler() {
        reader.readEntries(function (lote) {
          if (!lote.length) { Promise.all(todos.map(function (e) { return lerEntrada(e, lista); })).then(resolve); return; }
          todos = todos.concat(Array.prototype.slice.call(lote));
          ler();
        }, function () { resolve(); });
      })();
    });
  }
  var zona = $('zona');
  zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('ativa'); });
  zona.addEventListener('dragleave', function () { zona.classList.remove('ativa'); });
  zona.addEventListener('drop', async function (e) {
    e.preventDefault();
    zona.classList.remove('ativa');
    var items = e.dataTransfer.items;
    if (items && items.length && items[0].webkitGetAsEntry) {
      var lista = [];
      var entries = Array.prototype.map.call(items, function (it) { return it.webkitGetAsEntry(); }).filter(Boolean);
      for (var i = 0; i < entries.length; i++) await lerEntrada(entries[i], lista);
      processar(lista);
    } else {
      processar(e.dataTransfer.files);
    }
  });
  renderRegistrados();
})();
</script>
</body>
</html>
`;
}
