// Gera docs/Fundamentacao_TalkEncript.docx (documento editável da pesquisa normativa).
// Uso: node docs/gerar-fundamentacao.cjs   (requer o pacote "docx" do npm)

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle, ExternalHyperlink, Footer, PageNumber,
} = require(process.env.DOCX_PATH || 'docx');

const FONT = 'Arial';
const ACESSO = '01/10/2026';
const SIZE = 24; // meios-pontos: Arial 12, todo o texto em preto e justificado

const p = (text, opts = {}) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 160, line: 300 },
  children: [new TextRun({ text, font: FONT, size: SIZE, ...opts })],
});
const h = (text, level = HeadingLevel.HEADING_1) => new Paragraph({
  heading: level,
  alignment: AlignmentType.JUSTIFIED,
  spacing: { before: 280, after: 140 },
  children: [new TextRun({ text, font: FONT, bold: true, size: SIZE })],
});

const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (content, { bold = false, width, shade } = {}) => new TableCell({
  borders,
  width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
  shading: shade ? { fill: shade } : undefined,
  margins: { top: 60, bottom: 60, left: 90, right: 90 },
  children: [new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    children: Array.isArray(content) ? content : [new TextRun({ text: String(content), font: FONT, size: SIZE, bold })],
  })],
});
const link = (url) => [new ExternalHyperlink({ link: url, children: [new TextRun({ text: url, font: FONT, size: SIZE, color: '000000', underline: {} })] })];

function table(header, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((t, i) => cell(t, { bold: true, width: widths[i], shade: 'FFFFFF' })) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { width: widths[i] })) })),
    ],
  });
}

// Fontes consultadas. "Autor" indica a pessoa ou instituição responsável; quando a
// página não identifica o autor, ou não pôde ser aberta, isso é dito expressamente.
const FONTES = [
  ['Conselho Nacional de Justiça (Presidência)', 'Portaria nº 391, de 4 de novembro de 2025: institui grupo de trabalho sobre cadeia de custódia da prova digital', 'https://atos.cnj.jus.br/atos/detalhar/6418', '04/11/2025', 'Conteúdo verificado pelos resultados de busca; acesso direto à página bloqueado pela rede do ambiente de pesquisa.'],
  ['Conselho Nacional de Justiça (Presidência), cópia no clipping do STJ', 'Portaria Presidência nº 391, de 4 de novembro de 2025 (PDF)', 'https://www.stj.jus.br/internet_docs/biblioteca/clippinglegislacao/Prt_391_2025_CNJ.pdf', '04/11/2025', 'Mesmo ato, em cópia mantida pela Biblioteca do STJ.'],
  ['Migalhas (autor não identificado)', 'CNJ debate regras para provas digitais e diz que texto não limita MP', 'https://www.migalhas.com.br/quentes/465524/cnj-debate-regras-para-provas-digitais-e-diz-que-texto-nao-limita-mp', '2026 (data exata não confirmada)', 'Informa que a minuta prevê registro de quem acessou o material, da ferramenta, do momento e o uso de hash.'],
  ['Brasil em Folhas (autor não identificado)', 'CNJ propõe regras nacionais para provas digitais e gera reação no Ministério Público', 'https://www.brasilemfolhas.com.br/2026/09/cnj-propoe-regras-nacionais-para-provas-digitais-e-gera-reacao-no-ministerio-publico/', 'Setembro de 2026', 'Informa que a resolução ainda não foi aprovada em definitivo.'],
  ['Superior Tribunal de Justiça', 'Informativo de Jurisprudência nº 878, de 24/2/2026: AgRg no HC 1.014.212-ES, Rel. Min. Carlos Pires Brandão, Sexta Turma, julgado em 10/2/2026', 'https://scon.stj.jus.br/jurisprudencia/externo/informativo/?aplicacao=informativo&acao=pesquisar&livre=%40CNOT%3D%27022145%27', '24/02/2026', 'Ausência de certificação de integridade (código hash) e necessidade de perícia complementar.'],
  ['Consultor Jurídico, ConJur (autor não identificado)', 'STJ anula condenação por ausência de integralidade da prova digital', 'https://www.conjur.com.br/2025-nov-07/stj-anula-condenacao-por-ausencia-de-integralidade-da-prova-digital/', '07/11/2025', 'Noticia o HC 1.036.370, Rel. Min. Joel Ilan Paciornik.'],
  ['Consultor Jurídico, ConJur (autor não identificado)', 'Cabe ao MP comprovar confiabilidade do print de WhatsApp, diz ministro', 'https://www.conjur.com.br/2025-nov-14/cabe-ao-mp-comprovar-confiabilidade-do-print-de-whatsapp-diz-ministro/', '14/11/2025', 'Ônus do Estado de demonstrar a integridade da prova digital.'],
  ['Consultor Jurídico, ConJur (autor não identificado)', 'Prints sem prova da cadeia de custódia não mantêm condenação', 'https://conjur.com.br/2026-jan-09/prints-de-mensagens-sem-prova-da-cadeia-de-custodia-nao-sustentam-condenacao/', '09/01/2026', 'Prints sem rastreabilidade técnica não atendem à cadeia de custódia.'],
  ['Consultor Jurídico, ConJur (autor não identificado)', 'CNJ precisa padronizar cadeia de custódia de provas digitais', 'https://www.conjur.com.br/2025-jul-23/necessidade-de-padronizacao-pelo-conselho-nacional-de-justica-da-cadeia-de-custodia-da-prova-digital/', '23/07/2025', 'Artigo de opinião sobre a necessidade de regulamentação pelo CNJ.'],
  ['Presidência da República', 'Decreto-Lei nº 3.689/1941 (Código de Processo Penal), arts. 158-A a 158-F, incluídos pela Lei nº 13.964/2019', 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689.htm', '03/10/1941 (redação de 24/12/2019)', 'Link oficial indicado como referência; página não aberta nesta pesquisa.'],
  ['Presidência da República', 'Lei nº 13.105/2015 (Código de Processo Civil), arts. 369 e 384', 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm', '16/03/2015', 'Link oficial indicado como referência; página não aberta nesta pesquisa.'],
  ['Presidência da República', 'Lei nº 11.419/2006 (informatização do processo judicial)', 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11419.htm', '19/12/2006', 'Link oficial indicado como referência; página não aberta nesta pesquisa.'],
  ['Presidência da República', 'Medida Provisória nº 2.200-2/2001 (ICP-Brasil)', 'https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm', '24/08/2001', 'Link oficial indicado como referência; página não aberta nesta pesquisa.'],
  ['Presidência da República', 'Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais)', 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm', '14/08/2018', 'Link oficial indicado como referência; página não aberta nesta pesquisa.'],
  ['Associação Brasileira de Normas Técnicas (ABNT)', 'ABNT NBR ISO/IEC 27037:2013: diretrizes para identificação, coleta, aquisição e preservação de evidência digital', 'https://www.abntcatalogo.com.br/', '2013', 'Norma paga; citada conforme as decisões e notícias consultadas.'],
  ['National Institute of Standards and Technology (NIST)', 'FIPS 180-4: Secure Hash Standard (SHS)', 'https://csrc.nist.gov/pubs/fips/180-4/upd1/final', '08/2015', 'Especificação oficial do SHA-256 e do SHA-512. Link indicado como referência.'],
];

const REQUISITOS = [
  ['Registro de quem teve acesso ao material (minuta do CNJ; art. 158-A do CPP)', 'Cadastro do operador com nome completo, CPF validado, e-mail, celular e OAB; declaração do operador; registro cronológico com o nome do operador em cada ato.'],
  ['Registro da ferramenta utilizada (minuta do CNJ; ISO/IEC 27037)', 'Nome e versão do TalkEncript, criador, bibliotecas e suas versões, endereço de execução, navegador e sistema; hash SHA-256 de cada arquivo de código da ferramenta.'],
  ['Registro do momento de cada procedimento (minuta do CNJ)', 'Data e hora local e em UTC (ISO 8601), fuso horário, hora de referência do servidor com a diferença em segundos, e horário de início e fim do cálculo de cada arquivo.'],
  ['Uso de função hash (STJ, HC 1.036.370 e AgRg no HC 1.014.212/ES; ISO/IEC 27037)', 'SHA-256 e SHA-512 (FIPS 180-4) de cada arquivo e de cada item dos ZIPs, com o tamanho do resumo em bits; conferência do CRC-32 do ZIP.'],
  ['Preservação de metadados (minuta do CNJ)', 'Nome, caminho, tamanho em bytes, tipo e data de modificação de cada arquivo; data registrada no ZIP, tamanho e CRC-32 de cada item.'],
  ['Métodos reprodutíveis e auditáveis (STJ; ISO/IEC 27037)', 'Manifestos no formato padrão do sha256sum e do shasum; instruções de verificação para macOS, Linux e Windows; verificação na própria página; código de verificação do relatório (SHA-256 do JSON).'],
  ['Localização do ato', 'Geolocalização pela API do navegador, com latitude, longitude, precisão, altitude e momento da leitura, mediante autorização; local informado pelo operador.'],
  ['Proteção de dados pessoais (LGPD)', 'Consentimento expresso do operador; dados armazenados apenas no navegador; conteúdo da conversa nunca enviado à internet, garantido pela política de segurança da página.'],
];

const children = [
  new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120 }, children: [new TextRun({ text: 'TalkEncript', font: FONT, bold: true, size: SIZE })] }),
  new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 80 }, children: [new TextRun({ text: 'Fundamentação normativa e técnica do relatório de integridade de conversas', font: FONT, size: SIZE, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 360 }, children: [new TextRun({ text: `Carlos Alexandre Albuquerque Oliveira, advogado, OAB/PA 33.996. Pesquisa realizada em ${ACESSO}. Aplicativo: GestorLaw - TalkEncript V 1.0 (primeira versão).`, font: FONT, size: SIZE })] }),

  h('1. Objetivo'),
  p('Este documento reúne as normas, decisões e referências técnicas que orientaram o conteúdo do relatório emitido pelo TalkEncript, sistema executado no navegador que calcula o hash de conversas exportadas do WhatsApp, do Telegram e de outros aplicativos e registra as informações necessárias à demonstração da cadeia de custódia da prova digital.'),

  h('2. Situação das regras do Conselho Nacional de Justiça'),
  p('Até a data desta pesquisa, o Conselho Nacional de Justiça não possui ato normativo aprovado que discipline especificamente o cálculo de hash ou a cadeia de custódia da prova digital. Por meio da Portaria da Presidência nº 391, de 4 de novembro de 2025, o CNJ instituiu grupo de trabalho, presidido pelo Ministro Joel Ilan Paciornik, do Superior Tribunal de Justiça, para elaborar estudos e propostas sobre a matéria.'),
  p('Segundo as notícias consultadas, o grupo de trabalho elaborou minuta de resolução, de caráter vinculante, voltada ao controle judicial da cadeia de custódia de vestígios digitais em processos penais. A minuta prevê protocolos de rastreabilidade, preservação de metadados, registro de quem teve acesso ao material, de qual ferramenta foi utilizada e de quando cada procedimento ocorreu, e o uso de funções de resumo criptográfico (hash) para permitir a conferência posterior da integridade. Em setembro de 2026 a minuta ainda estava em análise e não havia sido aprovada em definitivo pelo Plenário.'),
  p('Por essa razão, o TalkEncript adota como parâmetro os requisitos da minuta, somados aos já exigidos pela legislação, pela jurisprudência do Superior Tribunal de Justiça e pela norma técnica ABNT NBR ISO/IEC 27037:2013. Recomenda-se acompanhar a tramitação e atualizar o sistema quando houver texto final aprovado.'),

  h('3. Legislação aplicável'),
  p('O Código de Processo Penal, nos arts. 158-A a 158-F, incluídos pela Lei nº 13.964/2019, define a cadeia de custódia como o conjunto de procedimentos utilizados para manter e documentar a história cronológica do vestígio coletado, de modo a rastrear sua posse e manuseio desde o reconhecimento até o descarte. Embora pensados para vestígios físicos, esses dispositivos vêm sendo aplicados pelos tribunais à prova digital.'),
  p('No processo civil, o art. 369 do Código de Processo Civil admite todos os meios legais e moralmente legítimos de prova, e o art. 384 prevê a ata notarial para atestar a existência e o modo de existir de fatos, inclusive dados representados por imagem ou som gravados em arquivos eletrônicos. A Lei nº 11.419/2006 e a Medida Provisória nº 2.200-2/2001 conferem validade jurídica aos documentos eletrônicos assinados digitalmente no âmbito da ICP-Brasil, o que fundamenta a recomendação de assinar o PDF do relatório com certificado digital.'),
  p('A Lei nº 13.709/2018 (LGPD) incide sobre os dados pessoais do operador. O TalkEncript colhe consentimento expresso, limita a finalidade à identificação do responsável no relatório e mantém os dados apenas no dispositivo do próprio operador.'),

  h('4. Jurisprudência do Superior Tribunal de Justiça'),
  p('No HC 1.036.370, julgado em 2025 sob relatoria do Ministro Joel Ilan Paciornik, o STJ anulou condenação fundada em capturas de tela de conversas de WhatsApp desacompanhadas de protocolo técnico de preservação. Segundo as notícias consultadas, a Corte reafirmou ser indispensável comprovar a integridade dos dados por meio de hash, a auditabilidade dos procedimentos, a documentação da cadeia de custódia e o uso de métodos reprodutíveis e justificáveis, conforme a ISO/IEC 27037:2013, cabendo ao Estado o ônus dessa demonstração.'),
  p('No AgRg no HC 1.014.212/ES, relatado pelo Ministro Carlos Pires Brandão e julgado pela Sexta Turma em 10 de fevereiro de 2026 (Informativo nº 878), o STJ tratou da ausência de certificação de integridade por código hash como circunstância que impõe perícia técnica complementar para confirmar a fidedignidade dos elementos probatórios digitais.'),

  h('5. Referências técnicas'),
  p('A ABNT NBR ISO/IEC 27037:2013 estabelece diretrizes para identificação, coleta, aquisição e preservação de evidência digital, com ênfase no uso de função hash, em ferramentas confiáveis e auditáveis e na documentação de cada etapa. A norma FIPS 180-4, do NIST, especifica os algoritmos SHA-256 e SHA-512 adotados pelo TalkEncript, cujos resumos têm, respectivamente, 256 e 512 bits. Não há colisão conhecida para esses algoritmos.'),

  h('6. Como o relatório do TalkEncript atende a esses requisitos'),
  table(['Requisito e origem', 'Como o relatório atende'], REQUISITOS, [40, 60]),
  new Paragraph({ spacing: { after: 160 }, children: [] }),

  h('7. Limitações e recomendações'),
  p('O hash demonstra a integridade dos arquivos a partir do momento da geração do relatório, mas não atesta, por si só, a autoria das mensagens nem a completude da exportação em relação ao conteúdo existente no aparelho. A data e a hora dependem do relógio do dispositivo, acompanhadas da hora de referência do servidor, e a geolocalização depende da autorização e da precisão do equipamento.'),
  p('Recomenda-se gerar o relatório logo após a exportação, preservar os arquivos originais e, se possível, o aparelho de origem, assinar o PDF com certificado ICP-Brasil, juntar aos autos o relatório, os manifestos e os arquivos e, conforme a relevância do caso, complementar com ata notarial ou perícia técnica.'),

  h('8. Fontes consultadas'),
  p(`Todas as fontes foram consultadas em ${ACESSO}. Quando a página não identifica o autor, ou não pôde ser aberta diretamente por restrição da rede utilizada na pesquisa, isso está indicado na coluna de observações.`),
  table(['Autor', 'Título', 'Link', 'Data de publicação', 'Data de acesso', 'Observação'],
    FONTES.map(([autor, titulo, url, pub, obs]) => [autor, titulo, link(url), pub, ACESSO, obs]),
    [15, 22, 25, 10, 9, 19]),
];

const doc = new Document({
  creator: 'Carlos Alexandre Albuquerque Oliveira',
  title: 'TalkEncript: fundamentação normativa e técnica',
  styles: {
    default: { document: { run: { font: FONT, size: SIZE, color: '000000' }, paragraph: { alignment: AlignmentType.JUSTIFIED } } },
    paragraphStyles: [1, 2].map((n) => ({ id: `Heading${n}`, name: `Heading ${n}`, basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: SIZE, bold: true, color: '000000' }, paragraph: { alignment: AlignmentType.JUSTIFIED } })),
  },
  sections: [{
    properties: { page: { margin: { top: 1200, bottom: 1200, left: 1300, right: 1300 } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [
            new TextRun({ text: 'TalkEncript, fundamentação normativa. Página ', font: FONT, size: SIZE }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE }),
          ],
        })],
      }),
    },
    children,
  }],
});

const out = path.join(__dirname, 'Fundamentacao_TalkEncript.docx');
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log(out); });
