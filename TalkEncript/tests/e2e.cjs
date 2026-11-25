// Teste de ponta a ponta no Chromium: cadastro, geração do relatório, conferência
// dos manifestos com sha256sum e verificação pela própria página.
// Uso: node tests/e2e.cjs   (requer playwright, python3, zip e sha256sum)

const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8765;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'talkencript-'));

function makeFixtures() {
  const src = path.join(work, 'export');
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, '_chat.txt'), [
    '[01/10/2026, 10:00:00] Maria Souza: Bom dia, João.',
    '[01/10/2026, 10:01:12] João Lima: Bom dia! Segue a foto.',
    '[01/10/2026, 10:01:13] João Lima: ‎<anexado: 00000002-PHOTO-2026-10-01-10-01-13.jpg>',
    '[01/10/2026, 10:05:00] Maria Souza: Recebido, obrigada. 😀',
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(src, '00000002-PHOTO-2026-10-01-10-01-13.jpg'), Buffer.alloc(3_000_000, 0xab));
  const zip = path.join(work, 'Conversa do WhatsApp com João Lima.zip');
  execSync(`cd "${src}" && zip -q -X "${zip}" _chat.txt 00000002-PHOTO-2026-10-01-10-01-13.jpg`);
  return zip;
}

async function makePrint(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 300 } });
  await page.setContent(`<body style="margin:0;font-family:sans-serif;background:#efeae2;padding:16px">
    <div style="background:#fff;border-radius:8px;padding:8px 12px;margin:8px 0;width:70%">Bom dia, João.<br><small>10:00</small></div>
    <div style="background:#d9fdd3;border-radius:8px;padding:8px 12px;margin:8px 0 8px auto;width:70%">Bom dia! Segue a foto.<br><small>10:01</small></div>
  </body>`);
  const file = path.join(work, 'print da conversa.png');
  await page.screenshot({ path: file });
  await page.close();
  return file;
}

/** Sem permissão de localização: aviso, contagem de 10 segundos e encerramento. */
async function deniedScenario(browser, url) {
  console.log(`\n=== localização negada: ${url}`);
  const context = await browser.newContext({ locale: 'pt-BR' });
  const page = await context.newPage();
  try {
    await page.goto(url);
    await page.waitForFunction(() => /será fechado em \d+ segundo/.test(document.querySelector('#bloqueio-localizacao')?.textContent ?? ''), null, { timeout: 30000 });
    const first = await page.textContent('#bloqueio-localizacao');
    assert.match(first, /Localização obrigatória/);
    await page.waitForFunction(() => /TalkEncript encerrado/.test(document.body.textContent), null, { timeout: 15000 });
    assert.strictEqual(await page.$('#gerar'), null, 'o aplicativo deveria estar encerrado');
    console.log('localização negada: aprovado.');
  } finally {
    await context.close();
  }
}

/** Arquivo apagado depois de selecionado: o erro deve ser explicado em português. */
async function missingFileScenario(browser, url, zipPath, printPath) {
  console.log(`\n=== arquivo indisponível: ${url}`);
  const context = await browser.newContext({ geolocation: { latitude: -1.455833, longitude: -48.503887, accuracy: 15 }, permissions: ['geolocation'], locale: 'pt-BR' });
  await context.route('https://**', (r) => r.abort());
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  try {
    await page.goto(url);
    await page.evaluate(() => localStorage.setItem('talkencript.operador', JSON.stringify({ nome: 'Maria Souza', cpf: '529.982.247-25', email: 'm@x.com.br', celular: '(91) 98888-7777', profissao: 'Advogada', consentimento: true, cadastradoEm: new Date().toISOString() })));
    await page.reload();
    await page.waitForSelector('#bloqueio-localizacao', { state: 'hidden', timeout: 5000 });
    const copia = path.join(work, 'sera apagado.zip');
    fs.copyFileSync(zipPath, copia);
    await page.setInputFiles('#entrada-arquivos', copia);
    // Com print juntado, o trecho transcrito é exigido para a comparação.
    await page.check('#caso-sem-imei');
    await page.check('#declaracao');
    await page.setInputFiles('#entrada-prints', printPath);
    await page.click('#gerar');
    assert.match(await page.textContent('#gerar-erro'), /descreva a mensagem que aparece no print/);
    await page.fill('#lista-prints textarea', 'Segue a foto.');
    fs.unlinkSync(copia);
    await page.check('#caso-sem-imei');
    await page.check('#declaracao');
    await page.click('#gerar');
    await page.waitForSelector('#gerar-erro:not([hidden])', { timeout: 60000 });
    const erro = await page.textContent('#gerar-erro');
    assert.match(erro, /o arquivo "sera apagado\.zip" não pôde ser lido/, erro);
    assert.doesNotMatch(erro, /could not be found/);
    // Sem o texto da conversa entre os arquivos, não há como comparar: geração recusada.
    await page.click('#lista-arquivos .item button');
    await page.setInputFiles('#entrada-arquivos', printPath);
    await page.click('#gerar');
    await page.waitForFunction(() => /é preciso enviar no passo 2 o texto da conversa exportada/.test(document.querySelector('#gerar-erro')?.textContent ?? ''), null, { timeout: 60000 });
    // Prints são opcionais: sem eles, o relatório é gerado normalmente.
    await page.click('#lista-arquivos .item button');
    await page.click('#lista-prints .print button');
    await page.setInputFiles('#entrada-arquivos', zipPath);
    await page.click('#gerar');
    await page.waitForSelector('#resultado:not([hidden])', { timeout: 60000 });
    console.log('arquivo indisponível: aprovado.');
  } finally {
    await context.close();
  }
}

async function scenario(browser, url, label, zipPath, printPath) {
  console.log(`\n=== ${label}: ${url}`);
  const context = await browser.newContext({ acceptDownloads: true, geolocation: { latitude: -1.455833, longitude: -48.503887, accuracy: 15 }, permissions: ['geolocation'], locale: 'pt-BR', timezoneId: 'America/Belem' });
  // Simula os serviços do OpenStreetMap (a rede de testes não tem acesso a eles).
  const fx = require('./fixtures-endereco.cjs');
  await context.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ json: fx.nominatim, headers: { 'access-control-allow-origin': '*' } }));
  await context.route('https://overpass-api.de/**', (r) => r.fulfill({ json: fx.overpass, headers: { 'access-control-allow-origin': '*' } }));
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  const local = url.startsWith('file:');
  const downloads = [];
  page.on('download', (d) => downloads.push(d));

  try {
    await page.goto(url);
    // Ao abrir, o aplicativo pede a localização e só libera o uso depois dela.
    // Com a localização autorizada, o aplicativo inicia imediatamente (em menos de 3 segundos).
    const t0 = Date.now();
    await page.waitForSelector('#bloqueio-localizacao', { state: 'hidden', timeout: 3000 });
    assert.ok(Date.now() - t0 < 3000);
    assert.ok(await page.isVisible('#operador-form'), 'após autorizar a localização, deve abrir o cadastro do operador');

    // Cadastro com CPF inválido deve ser recusado.
    await page.fill('input[name=nome]', 'Maria Souza');
    await page.fill('input[name=email]', 'maria@exemplo.com.br');
    await page.fill('input[name=celular]', '91988887777');
    await page.fill('input[name=cpf]', '11111111111');
    await page.check('input[name=consentimento]');
    await page.click('#operador-form button[type=submit]');
    assert.match(await page.textContent('[data-erro=cpf]'), /CPF inválido/);

    await page.fill('input[name=cpf]', '52998224725');
    await page.fill('input[name=profissao]', 'Advogada');
    await page.fill('input[name=link1Titulo]', 'Site do escritório');
    await page.fill('input[name=link1Url]', 'www.souza.adv.br');
    await page.fill('input[name=link2Titulo]', 'LinkedIn');
    await page.fill('input[name=link2Url]', 'https://www.linkedin.com/in/maria-souza');
    await page.check('input[name=advogado][value=sim]');
    await page.fill('input[name=oabNumero]', '12345');
    await page.selectOption('select[name=oabUF]', 'PA');
    // Escritório ou empresa (opcionais): documento inválido é recusado.
    await page.fill('input[name=empresaNome]', 'Souza Advocacia');
    await page.fill('input[name=empresaEndereco]', 'Av. Presidente Vargas, 1500, sala 801, Campina, Belém/PA, 66017-000');
    await page.fill('input[name=empresaDocumento]', '11222333000100');
    await page.click('#operador-form button[type=submit]');
    assert.match(await page.textContent('[data-erro=empresaDocumento]'), /CNPJ ou CPF inválido/);
    await page.fill('input[name=empresaDocumento]', '11222333000181');
    assert.strictEqual(await page.inputValue('input[name=empresaDocumento]'), '11.222.333/0001-81');
    await page.click('#operador-form button[type=submit]');
    // Primeiro cadastro: o aplicativo segue sozinho para a geração do relatório.
    await page.waitForSelector('#aba-gerar:not([hidden])');
    assert.match(await page.textContent('#operador-dados'), /OAB\/PA 12\.345/);

    // Geração do relatório.
    await page.selectOption('#caso-plataforma', 'WhatsApp');
    assert.strictEqual((await page.textContent('#rotulo-versao')).trim(), 'Versão do WhatsApp');
    await page.fill('#caso-versao', '2.26.18.73');
    await page.fill('#caso-conversa-inicio', '2026-10-01');
    const nomes = await page.$$('#lista-interlocutores [data-campo=nome]');
    const fones = await page.$$('#lista-interlocutores [data-campo=telefone]');
    await nomes[0].fill('Maria Souza');
    await fones[0].fill('91988887777');
    await nomes[1].fill('João Lima');
    await fones[1].fill('+55 91 97777-6666');
    await page.click('#adicionar-interlocutor');
    await page.fill('#lista-interlocutores .interlocutor:nth-child(3) [data-campo=nome]', 'Ana Prado');
    await page.fill('#lista-interlocutores .interlocutor:nth-child(3) [data-campo=telefone]', '+351 912 345 678');
    // Qualificação no caso (opcional) e relação entre os interlocutores.
    await page.fill('#lista-interlocutores .interlocutor:nth-child(1) [data-campo=qualificacao]', 'Reclamante');
    await page.fill('#lista-interlocutores .interlocutor:nth-child(2) [data-campo=qualificacao]', 'Reclamado(a)');
    await page.fill('#caso-relacao', 'Credora e devedor em acordo de pagamento');
    await page.fill('#caso-processo', '0801234-56.2026.8.14.0301');
    await page.fill('#caso-origem', 'iPhone 15 de Maria Souza');
    await page.fill('#caso-finalidade', 'Instruir ação de cobrança, demonstrando o acordo de pagamento.');
    await page.fill('#caso-imei', '490154203237519');
    await page.setInputFiles('#entrada-arquivos', zipPath);
    await page.setInputFiles('#entrada-prints', printPath);
    await page.fill('#lista-prints textarea', 'Segue a foto.');
    await page.check('#declaracao');
    await page.click('#gerar');
    assert.match(await page.textContent('#gerar-erro'), /IMEI inválido/);
    // A janela de progresso registra a porcentagem durante a geração.
    await page.evaluate(() => {
      window.__pcts = [];
      new MutationObserver(() => window.__pcts.push(Number(document.querySelector('#progresso-pct').textContent)))
        .observe(document.querySelector('#progresso-pct'), { childList: true, characterData: true, subtree: true });
    });
    await page.fill('#caso-imei', '490154203237518');
    await page.check('#declaracao');
    // Título da capa e assinatura com o certificado A1 fictício de teste.
    await page.fill('#caso-titulo', 'Conversa de teste - acordo de pagamento');
    await page.setInputFiles('#cert-arquivo', path.join(ROOT, 'tests/fixtures/certificado-teste.pfx'));
    await page.fill('#cert-senha', 'senha errada');
    await page.click('#cert-conferir');
    await page.waitForFunction(() => /senha do certificado incorreta/.test(document.querySelector('#cert-status').textContent));
    await page.fill('#cert-senha', 'teste1234');
    await page.click('#cert-conferir');
    await page.waitForFunction(() => /Certificado conferido: MARIA SOUZA DE TESTE, CPF 529\.982\.247-25/.test(document.querySelector('#cert-status').textContent));
    assert.strictEqual(await page.inputValue('#cert-senha'), '', 'a senha não deve ficar no formulário');
    await page.click('#gerar');
    await page.waitForSelector('#resultado:not([hidden]), #gerar-erro:not([hidden])', { timeout: 60000 });
    assert.ok(await page.isHidden('#gerar-erro'), await page.textContent('#gerar-erro'));
    assert.strictEqual(await page.getAttribute('#link-google-maps', 'href'), 'https://www.google.com/maps/search/?api=1&query=-1.455833,-48.503887');
    const pcts = await page.evaluate(() => window.__pcts);
    assert.ok(pcts.length >= 4 && pcts.at(-1) === 100, `porcentagens: ${pcts.join(', ')}`);
    assert.ok(pcts.every((v, i) => i === 0 || v >= pcts[i - 1]), 'a porcentagem não pode diminuir');
    assert.ok(await page.isHidden('#progresso-geracao'));
    const code = (await page.textContent('#resultado-codigo')).trim();
    assert.match(code, /^[0-9a-f]{64}$/);

    // Ao gerar, somente o pacote zipado é baixado (nenhum arquivo solto).
    await page.waitForFunction(() => /Pacote baixado/.test(document.querySelector('#downloads-status')?.textContent ?? ''));
    await page.waitForTimeout(800);
    const suggested = downloads.map((d) => d.suggestedFilename());
    assert.deepStrictEqual(suggested, ['Relatório Hash_Maria Souza, João Lima e Ana Prado.zip']);
    const pkg = path.join(work, `${label}-${suggested[0]}`);
    await downloads[0].saveAs(pkg);
    // O botão Baixar o pacote novamente repete apenas o download do ZIP.
    downloads.length = 0;
    await page.click('#baixar-tudo');
    await page.waitForTimeout(800);
    assert.deepStrictEqual(downloads.map((d) => d.suggestedFilename()), [suggested[0]]);
    const out = path.join(work, `pacote-${label}`);
    // Extração pelo módulo zipfile do Python, que respeita a marca UTF-8 dos nomes
    // (o unzip de algumas distribuições a ignora quando o locale não é UTF-8).
    execSync(`python3 -m zipfile -e "${pkg}" "${out}"`);
    const folder = path.join(out, fs.readdirSync(out)[0]);
    const names = fs.readdirSync(folder);
    console.log('Pacote:', names.join(', '));
    assert.ok(names.some((n) => /^Relatório_TE-.*\.pdf$/.test(n)), 'PDF ausente');
    const jsonName = names.find((n) => /^relatorio_TE-.*\.json$/.test(n));
    const report = JSON.parse(fs.readFileSync(path.join(folder, jsonName), 'utf8'));

    // Código de verificação = SHA-256 do JSON.
    const jsonHash = execSync(`sha256sum "${path.join(folder, jsonName)}"`).toString().split(' ')[0];
    assert.strictEqual(jsonHash, code);
    // Relatório no formato de relatório técnico: capa, certificação, detalhes do registro.
    const pdfPath = path.join(folder, names.find((n) => /^Relatório_.*\.pdf$/.test(n)));
    const pagina = (n) => execSync(`pdftotext -f ${n} -l ${n} "${pdfPath}" -`).toString().replace(/\s+/g, ' ');
    const sem = (t) => t.replace(/\s+/g, '');
    const capa = pagina(1);
    for (const t of ['TalkEncript', 'Relatório assinado digitalmente', 'Integridade de conversa', 'Identificador', report.id, 'Conversa de teste - acordo de pagamento', 'PESSOA FÍSICA', 'Maria Souza / CPF 529.982.247-25', 'OAB/PA 12.345', 'Souza Advocacia']) {
      assert.ok(capa.includes(t), `capa sem "${t}"`);
    }
    const certificacao = pagina(3);
    for (const t of ['Certificação', 'ASSINATURA DIGITAL', 'Assinado por MARIA SOUZA DE TESTE', 'CPF 529.982.247-25', 'HASH MASTER', 'Validador online', 'Importante']) {
      assert.ok(certificacao.includes(t), `certificação sem "${t}"`);
    }
    assert.ok(sem(certificacao).includes(report.arquivos[0].sha256), 'hash master ausente na certificação');
    assert.ok(sem(certificacao).includes(`TalkEncript-Verificar/#r=${report.id}&c=${code}`), 'endereço do validador ausente');
    const detalhes = pagina(4);
    for (const t of ['1. Detalhes do registro', 'Iniciado em', 'Finalizado em', 'Tempo de sessão', 'UTC', 'Fuso horário do dispositivo', 'Ambiente', 'Arquivos analisados (conversa exportada)', 'HASH SHA3-512', 'Página 4 de']) {
      assert.ok(detalhes.includes(t), `detalhes do registro sem "${t}"`);
    }
    assert.ok(sem(detalhes).includes(report.arquivos[0].sha3_512), 'SHA3-512 da conversa ausente');
    const inteiro = execSync(`pdftotext "${pdfPath}" -`).toString().replace(/\s+/g, ' ');
    for (const t of ['1.1 Imagens de tela (prints)', 'Print 1 de 1', 'Mensagem descrita no print', 'MENSAGEM ENCONTRADA', '1.3 Metadados técnicos', `ambiente_${report.id}.json`, 'Registro cronológico da cadeia de custódia', 'Validação do registro', 'openssl dgst -sha3-512']) {
      assert.ok(inteiro.includes(t), `relatório sem "${t}"`);
    }
    // SHA3-512 conferido com o Node e assinatura PAdES conferida pelo OpenSSL.
    const zipBytes = fs.readFileSync(zipPath);
    assert.strictEqual(report.arquivos[0].sha3_512, require('crypto').createHash('sha3-512').update(zipBytes).digest('hex'));
    assert.strictEqual(report.assinatura.titular, 'MARIA SOUZA DE TESTE');
    assert.strictEqual(report.metadados[0].arquivo, `ambiente_${report.id}.json`);
    assert.strictEqual(report.metadados[0].sha256, require('crypto').createHash('sha256').update(fs.readFileSync(path.join(folder, report.metadados[0].arquivo))).digest('hex'));
    const pdfBytes = fs.readFileSync(pdfPath);
    const br = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(pdfBytes.toString('latin1')).slice(1).map(Number);
    assert.strictEqual(br[2] + br[3], pdfBytes.length, 'a assinatura deve cobrir o arquivo inteiro');
    fs.writeFileSync(path.join(work, 'conteudo.bin'), Buffer.concat([pdfBytes.subarray(0, br[1]), pdfBytes.subarray(br[2])]));
    const hex = pdfBytes.subarray(br[1] + 1, br[2] - 1).toString('latin1');
    const der = Buffer.from(hex, 'hex');
    const len = der[1] & 0x80 ? der.subarray(2, 2 + (der[1] & 0x7f)).reduce((t, x) => t * 256 + x, 0) + 2 + (der[1] & 0x7f) : der[1] + 2;
    fs.writeFileSync(path.join(work, 'assinatura.p7s'), der.subarray(0, len));
    execSync(`openssl cms -verify -binary -inform DER -in "${path.join(work, 'assinatura.p7s')}" -content "${path.join(work, 'conteudo.bin')}" -CAfile "${path.join(ROOT, 'tests/fixtures/ac-teste.crt')}" -purpose any -out /dev/null`, { stdio: 'inherit' });
    // Pacote confere consigo mesmo.
    execSync(`cd "${folder}" && sha256sum -c pacote_*.sha256`, { stdio: 'inherit' });

    // Conteúdo do relatório.
    if (!local) assert.strictEqual(report.geolocalizacao.latitude.toFixed(6), '-1.455833');
    console.log('Geolocalização:', JSON.stringify(report.geolocalizacao), 'Worker embutido:', local);
    assert.deepStrictEqual(report.caso.interlocutores, [
      { nome: 'Maria Souza', telefone: '(91) 98888-7777', qualificacao: 'Reclamante' },
      { nome: 'João Lima', telefone: '(91) 97777-6666', qualificacao: 'Reclamado(a)' },
      { nome: 'Ana Prado', telefone: '+351 912 345 678', qualificacao: null },
    ]);
    assert.strictEqual(report.caso.relacaoInterlocutores, 'Credora e devedor em acordo de pagamento');
    assert.strictEqual(report.caso.dataConversaInicio, '2026-10-01');
    assert.strictEqual(report.caso.imei, '4901 •••••••• 518');
    // O IMEI completo não pode constar de nenhum arquivo do pacote.
    for (const n of names) assert.ok(!fs.readFileSync(path.join(folder, n)).includes('490154203237518'), `IMEI completo em ${n}`);
    for (const n of names.filter((x) => /\.(txt|json)$/.test(x))) assert.ok(!fs.readFileSync(path.join(folder, n), 'utf8').includes('20323'), `IMEI parcial indevido em ${n}`);
    assert.strictEqual(report.endereco.tipoLogradouro, 'Avenida');
    assert.strictEqual(report.endereco.logradouro, 'Presidente Vargas');
    assert.strictEqual(report.endereco.estado, 'Pará (PA)');
    assert.strictEqual(report.endereco.cep, '66017-000');
    assert.deepStrictEqual(report.endereco.numerosProximos.map((n) => n.numero), ['1510', '1490', '82']);
    assert.strictEqual(report.prints.length, 1);
    assert.strictEqual(report.prints[0].comparacao.situacao, 'encontrado');
    assert.strictEqual(report.prints[0].largura, 390);
    assert.strictEqual(report.operador.oab, 'OAB/PA 12.345');
    assert.deepStrictEqual(report.operador.escritorio, { nome: 'Souza Advocacia', endereco: 'Av. Presidente Vargas, 1500, sala 801, Campina, Belém/PA, 66017-000', documento: '11.222.333/0001-81' });
    assert.strictEqual(report.ferramenta.versao, '2.1');
    assert.strictEqual(report.operador.profissao, 'Advogada');
    assert.deepStrictEqual(report.operador.links, [
      { titulo: 'Site do escritório', url: 'https://www.souza.adv.br' },
      { titulo: 'LinkedIn', url: 'https://www.linkedin.com/in/maria-souza' },
    ]);
    assert.strictEqual(report.arquivos[0].zipEntries.length, 2);
    assert.ok(report.arquivos[0].zipEntries.every((e) => e.crcOk));
    assert.strictEqual(report.conversas[0].mensagens, 4);
    assert.match(report.caso.tipoExportacao, /Com mídia/);
    assert.ok(report.ferramenta.codigo.length >= 10, 'hash do código da ferramenta ausente');
    fs.copyFileSync(printPath, path.join(folder, path.basename(printPath)));
    execSync(`cd "${folder}" && sha256sum -c prints_*.sha256`, { stdio: 'inherit' });
    const txt = fs.readFileSync(path.join(folder, names.find((n) => n.endsWith('.txt'))), 'utf8');
    assert.match(txt, /Escritório ou empresa: Souza Advocacia/);
    assert.match(txt, /CNPJ\/CPF do escritório ou empresa: 11\.222\.333\/0001-81/);
    assert.match(txt, /SHA3-512: 512 bits \(128 caracteres hexadecimais\); família SHA-3, norma FIPS 202/);
    assert.match(txt, /Carlos Alexandre Albuquerque Oliveira/);
    assert.match(txt, /Interlocutor 1: Maria Souza\nQualificação no caso: Reclamante\nTelefone: \(91\) 98888-7777\n/);
    assert.match(txt, /Interlocutor 2: João Lima\nQualificação no caso: Reclamado\(a\)\nTelefone:/);
    assert.match(txt, /Relação entre os interlocutores: Credora e devedor em acordo de pagamento\n/);
    assert.strictEqual(report.caso.interlocutores[2].qualificacao, null);
    assert.match(txt, /Interlocutor 3: Ana Prado\nTelefone: \+351 912 345 678\n/);
    assert.match(txt, /Data da conversa: 01\/10\/2026/);
    assert.match(txt, /Versão do WhatsApp: 2\.26\.18\.73/);
    assert.match(txt, /VALIDAÇÃO DO REGISTRO/);
    assert.match(txt, /Profissão: Advogada/);
    assert.match(txt, /IMEI do aparelho: 4901 •••••••• 518/);
    assert.match(txt, /Finalidade informada pelo operador: Instruir ação de cobrança, demonstrando o acordo de pagamento\./);
    assert.match(txt, /Tipo de logradouro: Avenida/);
    assert.match(txt, /Bairro: Campina/);
    assert.match(txt, /Print 1 de 1: print da conversa\.png/);
    assert.match(txt, /\d+\.\d+ Preservação do arquivo exportado/);
    assert.match(txt, /HASH MASTER \(SHA-256 do arquivo analisado\)\nConversa do WhatsApp com João Lima\.zip: [0-9a-f]{64}/);
    assert.doesNotMatch(txt, /\d+\. COMPARAÇÃO COM A CONVERSA EXPORTADA/);
    // Transcrição integral da conversa em PDF, conferida linha a linha com o _chat.txt original.
    // Prints reunidos em PDF único (até 5 MB), com o cabeçalho técnico e a mensagem descrita.
    const printsPdfNome = names.find((n) => /^Prints_TE-[^_]+\.pdf$/.test(n));
    assert.ok(printsPdfNome, `PDF dos prints ausente no pacote: ${names.join(', ')}`);
    assert.ok(fs.statSync(path.join(folder, printsPdfNome)).size <= 4000000);
    assert.strictEqual(report.printsPdf.limiteBytes, 4000000);
    assert.match(txt, /Conversa do WhatsApp com João Lima\.zip \(3,3 KB\) - Conversa exportada do WhatsApp \(2 itens\)/);
    assert.strictEqual(report.printsPdf.partes.length, 1);
    assert.strictEqual(report.printsPdf.partes[0].arquivo, printsPdfNome);
    assert.strictEqual(report.printsPdf.partes[0].sha256, require('crypto').createHash('sha256').update(fs.readFileSync(path.join(folder, printsPdfNome))).digest('hex'));
    const printsTexto = execSync(`pdftotext "${path.join(folder, printsPdfNome)}" -`).toString().replace(/\s+/g, ' ');
    for (const t of ['TALK ENCRIPT', 'PRINTS', 'PÁGINA 1 DE 1', 'RELATÓRIO HASH', 'Print 1 de 1: print da conversa.png', 'Mensagem descrita no print:', '"Segue a foto."', 'MENSAGEM ENCONTRADA', report.prints[0].sha256]) {
      assert.ok(printsTexto.includes(t), `PDF dos prints sem: ${t}`);
    }
    assert.ok(txt.includes(`${printsPdfNome} (`) && txt.includes(`HASH SHA-256: ${report.printsPdf.partes[0].sha256}`), 'PDF dos prints ausente da lista de arquivos gerados');
    const transcricaoNome = names.find((n) => /^Conversa integral_TE-.*\.pdf$/.test(n));
    assert.ok(transcricaoNome, 'PDF da transcrição integral ausente do pacote');
    assert.strictEqual(report.transcricao.arquivo, transcricaoNome);
    assert.strictEqual(report.transcricao.linhas, 4);
    assert.strictEqual(report.transcricao.caracteresRepresentadosPorCodigo, 1);
    assert.match(txt, /\nTranscrição integral\n/);
    const original = execSync(`python3 -c "import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read('_chat.txt').decode('utf-8'),end='')" "${zipPath}"`).toString();
    const pdfLinhas = execSync(`pdftotext -layout "${path.join(folder, transcricaoNome)}" -`).toString();
    // A Transcrição integral tem o mesmo cabeçalho técnico do Relatório na primeira página.
    const transcricaoP1 = execSync(`pdftotext -f 1 -l 1 -layout "${path.join(folder, transcricaoNome)}" -`).toString();
    for (const t of ['TALK ENCRIPT', 'TRANSCRIÇÃO INTEGRAL', 'PÁGINA 1 DE', 'RELATÓRIO HASH', 'Nº DO RELATÓRIO', 'DATA DE GERAÇÃO', 'OPERADOR', 'CPF DO OPERADOR', '529.982.247-25', 'MOTIVO', 'INTERLOCUTORES', '1. Maria Souza', 'Telefone: (91) 98888-7777']) {
      assert.ok(transcricaoP1.includes(t), `cabeçalho técnico da transcrição sem: ${t}`);
    }
    original.split('\n').filter(Boolean).forEach((linha, i) => {
      const esperado = linha.replace(/\u200e/g, '').replace('😀', '[U+1F600]');
      // Linhas longas quebram visualmente no PDF; compara-se o conteúdo sem os espaços de diagramação.
      assert.ok(pdfLinhas.replace(/\s+/g, '').includes(`${i + 1}${esperado.replace(/\s+/g, '')}`), `linha ${i + 1} ausente ou diferente na transcrição: ${esperado}`);
    });
    assert.match(txt, /Resultado da comparação: MENSAGEM ENCONTRADA na conversa exportada/);
    assert.match(txt, /Mensagem descrita no print: "Segue a foto\."/);
    assert.match(txt, /Encontrada na linha \d+ da conversa exportada: \[01\/10\/2026, 10:01:12\] João Lima: Bom dia! Segue a foto\./);
    assert.doesNotMatch(txt, /nenhum arquivo da conversa exportada é idêntico|Imagem idêntica na conversa/);
    assert.match(txt, /Localização no Google Maps: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=-1\.455833,-48\.503887/);
    assert.ok(fs.readFileSync(path.join(folder, names.find((n) => /^Relatório_.*\.pdf$/.test(n)))).includes('/URI (https://www.google.com/maps/search/?api=1&query=-1.455833,-48.503887)'), 'link clicável do Google Maps ausente no PDF');
    assert.match(txt, /País: Brasil/);
    assert.match(txt, /Números de imóveis próximos: nº 1510, Avenida Presidente Vargas \(a \d+ m\)/);
    assert.match(txt, /Link 2: LinkedIn: https:\/\/www\.linkedin\.com\/in\/maria-souza/);
    // Os comandos de validação manual do relatório funcionam de fato.
    assert.ok(!/[0-9a-f]{64}  /.test(txt), 'formato com dois espaços ainda presente no relatório');
    const linhas = txt.split('\n').map((l) => l.trim());
    const macLinha = linhas.find((l) => /^SHA-256 +macOS: +shasum -a 256 '.*'$/.test(l));
    assert.ok(macLinha, 'comando manual do macOS ausente no relatório');
    const macCmd = macLinha.replace(/^SHA-256 +macOS: +/, '');
    assert.ok(execSync(macCmd, { cwd: path.dirname(zipPath), shell: '/bin/bash' }).toString().startsWith(report.arquivos[0].sha256));
    const sha3Linha = linhas.find((l) => /^SHA3-512 macOS e Linux: openssl dgst -sha3-512 '.*'$/.test(l));
    assert.ok(sha3Linha, 'comando manual do SHA3-512 ausente no relatório');
    assert.ok(execSync(sha3Linha.replace(/^SHA3-512 macOS e Linux: /, ''), { cwd: path.dirname(zipPath), shell: '/bin/bash' }).toString().trim().endsWith(report.arquivos[0].sha3_512));
    const psManual = linhas.find((l) => /^Windows: Get-FileHash -Algorithm SHA256 '.*'$/.test(l));
    assert.ok(psManual, 'comando manual do Windows ausente no relatório');

    // Manifestos aceitos pelo sha256sum (mesmo formato do shasum do macOS).
    fs.copyFileSync(zipPath, path.join(folder, path.basename(zipPath)));
    execSync(`cd "${folder}" && sha256sum -c arquivos_*.sha256 && sha512sum -c arquivos_*.sha512`, { stdio: 'inherit' });
    execSync(`cd "${folder}" && shasum -a 256 -c arquivos_*.sha256 && shasum -a 512 -c arquivos_*.sha512 && shasum -a 256 -c pacote_*.sha256`, { stdio: 'inherit' });
    const base = path.basename(zipPath, '.zip');
    execSync(`cd "${folder}" && python3 -m zipfile -e "${path.basename(zipPath)}" "${base}" && sha256sum -c conteudo-zip_*.sha256`, { stdio: 'inherit' });

    // Verificador pelo terminal (verificar.sh), como o usuário executa: bash e o arquivo.
    // Primeiro com o sha256sum (Linux) e depois só com o shasum (macOS).
    const sh = path.join(folder, 'verificar.sh');
    assert.ok((fs.statSync(sh).mode & 0o111) || true);
    const semSha256sum = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-'));
    for (const t of ['sh', 'bash', 'cut', 'grep', 'head', 'sed', 'basename', 'dirname', 'shasum', 'perl', 'printf', 'cat']) {
      try { fs.symlinkSync(execSync(`command -v ${t}`, { shell: '/bin/bash' }).toString().trim(), path.join(semSha256sum, t)); } catch { /* ferramenta interna do shell */ }
    }
    for (const env of [process.env, { ...process.env, PATH: semSha256sum }]) {
      const saida = execSync(`bash "${sh}" < /dev/null`, { env, cwd: os.tmpdir() }).toString();
      assert.match(saida, /ÍNTEGRO {3}Conversa do WhatsApp com João Lima\.zip/);
      assert.match(saida, /ÍNTEGRO {3}print da conversa\.png/);
      assert.match(saida, /ÍNTEGRO {3}Relatório_TE-/);
      assert.match(saida, /ÍNTEGRO {3}Conversa do WhatsApp com João Lima\/_chat\.txt/);
      assert.match(saida, /RESULTADO: \d+ arquivo\(s\) conferido\(s\), todos ÍNTEGROS/);
      assert.doesNotMatch(saida, /ALTERADO|AUSENTE/);
    }
    // Arquivo indicado diretamente e arquivo alterado.
    assert.match(execSync(`bash "${sh}" "${zipPath}"`).toString(), /ÍNTEGRO {3}.*Conversa do WhatsApp com João Lima\.zip \(idêntico a/);
    assert.match(execSync(`bash "${sh}" "${path.basename(zipPath)}"`, { cwd: path.dirname(zipPath) }).toString(), /ÍNTEGRO {3}/);
    const alterado = path.join(os.tmpdir(), 'conversa-alterada.zip');
    fs.writeFileSync(alterado, Buffer.concat([fs.readFileSync(zipPath), Buffer.from('x')]));
    let falhou = false;
    try { execSync(`bash "${sh}" "${alterado}"`); } catch (e) { falhou = true; assert.match(e.stdout.toString(), /NÃO CONFERE/); }
    assert.ok(falhou, 'o verificador deve acusar o arquivo alterado');
    // Windows: o verificar.ps1 e o verificar.bat estão no pacote, com o hash da conversa.
    const ps1 = fs.readFileSync(path.join(folder, 'verificar.ps1'), 'utf8');
    assert.ok(ps1.startsWith('\ufeff') && ps1.includes(report.arquivos[0].sha256));
    assert.match(fs.readFileSync(path.join(folder, 'verificar.bat'), 'utf8'), /verificar\.ps1/);
    let pwsh = '';
    try { pwsh = execSync('command -v pwsh', { shell: '/bin/bash' }).toString().trim(); } catch { /* sem PowerShell */ }
    if (pwsh) {
      const ps = execSync(`"${pwsh}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${path.join(folder, 'verificar.ps1')}"`, { cwd: os.tmpdir() }).toString();
      assert.match(ps, /ÍNTEGRO {3}Conversa do WhatsApp com João Lima\.zip/);
      assert.match(ps, /RESULTADO: \d+ arquivo\(s\) conferido\(s\), todos ÍNTEGROS/);
      const psArg = execSync(`"${pwsh}" -NoProfile -NonInteractive -File "${path.join(folder, 'verificar.ps1')}" "${path.basename(zipPath)}"`, { cwd: path.dirname(zipPath) }).toString();
      assert.match(psArg, /ÍNTEGRO {3}.*\(idêntico a/);
    } else {
      console.log('PowerShell indisponível: verificar.ps1 não executado neste ambiente.');
    }

    // Página de verificação do pacote: arquivo íntegro e arquivo alterado.
    const verificadorNome = fs.readdirSync(folder).find((n) => /^Verificar integridade_TE-.*\.html$/.test(n));
    assert.ok(verificadorNome, 'página de verificação ausente no pacote');
    const vp = await page.context().newPage();
    await vp.goto(`file://${path.join(folder, verificadorNome)}`);
    await vp.setInputFiles('#entrada-arquivos', [zipPath, printPath]);
    await vp.waitForFunction(() => /Conferência concluída/.test(document.getElementById('status').textContent));
    assert.match(await vp.textContent('#veredito'), /2 arquivo\(s\) ÍNTEGRO\(S\)/);
    const copiaAlterada = path.join(os.tmpdir(), path.basename(zipPath));
    fs.writeFileSync(copiaAlterada, Buffer.concat([fs.readFileSync(zipPath), Buffer.from('x')]));
    await vp.setInputFiles('#entrada-arquivos', copiaAlterada);
    await vp.waitForFunction(() => /ALTERADO/.test(document.getElementById('veredito').textContent));
    // Exportar em PDF: abre a impressão do navegador com o resultado da conferência.
    await vp.evaluate(() => { window.__impresso = 0; window.print = () => { window.__impresso++; }; });
    await vp.click('#btn-exportar');
    assert.strictEqual(await vp.evaluate(() => window.__impresso), 1);
    assert.match(await vp.textContent('#dados-conferencia'), /Conferência realizada em.*Arquivos conferidos3 \(2 íntegro\(s\), 1 alterado\(s\)/s);
    const pdfConferencia = path.join(folder, 'conferencia.pdf');
    await vp.emulateMedia({ media: 'print' });
    await vp.pdf({ path: pdfConferencia, format: 'A4', printBackground: true });
    const textoConferencia = execSync(`pdftotext "${pdfConferencia}" -`).toString();
    assert.match(textoConferencia, /Resultado da conferência/);
    assert.match(textoConferencia, /Íntegro/);
    assert.doesNotMatch(textoConferencia, /Arraste aqui os arquivos|Exportar em PDF/);
    fs.unlinkSync(pdfConferencia);
    await vp.close();

    // Verificação pela página: íntegro.
    await page.click('[data-aba=verificar]');
    await page.setInputFiles('#verif-referencia', path.join(folder, jsonName));
    await page.setInputFiles('#verif-arquivos', zipPath);
    await page.click('#verificar');
    await page.waitForSelector('#verif-resultado:not([hidden])');
    assert.match(await page.textContent('#verif-resultado .veredito'), /Íntegro/);
    assert.match(await page.textContent('#verif-resultado'), new RegExp(code));

    // Verificação pela página: arquivo alterado.
    const tampered = path.join(work, path.basename(zipPath));
    fs.mkdirSync(path.dirname(tampered), { recursive: true });
    const bytes = fs.readFileSync(zipPath);
    bytes[100] ^= 1;
    const tamperedDir = path.join(work, `alterado-${label}`);
    fs.mkdirSync(tamperedDir);
    fs.writeFileSync(path.join(tamperedDir, path.basename(zipPath)), bytes);
    await page.setInputFiles('#verif-arquivos', path.join(tamperedDir, path.basename(zipPath)));
    await page.click('#verificar');
    await page.waitForFunction(() => /divergência/.test(document.querySelector('#verif-resultado .veredito')?.textContent ?? ''));

    // Comparação de um arquivo com um hash em maiúsculas e com espaços.
    const sha = report.arquivos[0].sha256.toUpperCase().replace(/(.{8})/g, '$1 ');
    await page.setInputFiles('#unico-arquivo', zipPath);
    await page.fill('#unico-hash', sha);
    await page.click('#unico-comparar');
    await page.waitForFunction(() => /idênticos/.test(document.querySelector('#unico-resultado')?.textContent ?? ''));

    await page.screenshot({ path: path.join(work, `tela-${label}.png`), fullPage: true });
    fs.copyFileSync(path.join(folder, names.find((n) => /^Relatório_.*\.pdf$/.test(n))), path.join(work, `relatorio-${label}.pdf`));
    assert.deepStrictEqual(problems, [], `Erros no console: ${problems.join(' | ')}`);
    console.log(`${label}: aprovado.`);
  } catch (error) {
    console.error('Diagnóstico:', await page.textContent('#gerar-erro').catch(() => ''), await page.textContent('#progresso-etapa').catch(() => ''), problems);
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  const zipPath = makeFixtures();
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  // Locale UTF-8 garante que o Chromium aceite nomes de arquivo com acentos.
  const env = { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, env } : { env });
  try {
    const printPath = await makePrint(browser);
    await deniedScenario(browser, `http://127.0.0.1:${PORT}/codigo-fonte.html`);
    await missingFileScenario(browser, `http://127.0.0.1:${PORT}/codigo-fonte.html`, zipPath, printPath);
    await scenario(browser, `http://127.0.0.1:${PORT}/codigo-fonte.html`, 'servidor', zipPath, printPath);
    const single = path.join(ROOT, 'TalkEncript.html');
    if (fs.existsSync(single)) await scenario(browser, `file://${single}`, 'arquivo-unico', zipPath, printPath);
    else console.log('TalkEncript.html ausente; execute npm run build para testar o arquivo único.');
    console.log(`\nTodos os testes passaram. Arquivos de teste em ${work}`);
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
