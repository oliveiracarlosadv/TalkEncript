# GestorLaw - TalkEncript V 2.1

Versão do aplicativo: V 2.1, segunda versão.

Novidades da V 2.1: relatório no formato de relatório técnico de preservação de prova digital (capa, certificação com QR code do validador online, detalhes do registro em hora local e UTC, prints em página inteira, vídeos, metadados técnicos, cadeia de custódia em tabela e seções de explicação e validação); três códigos hash por arquivo (SHA-256, SHA-512 e SHA3-512); assinatura digital opcional do relatório com certificado A1 (.pfx), no padrão PAdES, feita no próprio computador; e página pública de verificação. Detalhes em [NOVIDADES.md](NOVIDADES.md).

O TalkEncript gera o Relatório de integridade (hash) de conversas exportadas do WhatsApp, do Telegram ou de qualquer outro aplicativo, com ou sem mídia, e permite juntar, de forma opcional, prints em JPG, PNG ou PDF para comparação com a conversa exportada. Funciona em Windows, macOS, Linux e Chromebook com dois cliques, sem instalação, e os arquivos da conversa nunca saem do computador do usuário.

Criador: Carlos Alexandre Albuquerque Oliveira, advogado, OAB/PA 33.996. Veja a seção [Sobre o criador](#sobre-o-criador).

## Como baixar e abrir com dois cliques

O aplicativo é distribuído no pacote [`GestorLaw - TalkEncript V 2.1.zip`](GestorLaw%20-%20TalkEncript%20V%202.1.zip). Para obtê-lo pelo GitHub, abra o arquivo no repositório e clique no botão de download (Download raw file). O pacote contém o aplicativo `TalkEncript.html`, o arquivo `TalkEncript.html.sha256` com o hash do aplicativo, o `LEIA-ME.txt` com as instruções e a pasta `exemplos` para teste.

Extraia o pacote em uma pasta do computador, por exemplo na Área de Trabalho: no Windows, clique com o botão direito e escolha Extrair tudo; no macOS, dê dois cliques no arquivo. Depois, basta dar dois cliques no `TalkEncript.html`: ele abre no navegador padrão (Chrome, Edge, Firefox ou Safari) e funciona em Windows, macOS e Linux, sem instalação. O mesmo pacote pode ser copiado para um pen drive ou enviado a outros usuários.

Para conferir que a cópia do aplicativo é original, compare o SHA-256 do `TalkEncript.html` com o valor que está em `TalkEncript.html.sha256`, como explicado no `LEIA-ME.txt`.

Em celulares, os navegadores costumam não executar arquivos HTML salvos no aparelho. Para uso no celular, publique o sistema em um endereço da internet (veja a seção Publicação) e acesse pelo navegador.

## Como testar

A pasta `exemplos`, que vem dentro do pacote (e também está em [`exemplos`](exemplos) no repositório), contém uma conversa fictícia exportada do WhatsApp, com uma foto (`Conversa do WhatsApp com João Lima.zip`), e um print dessa mesma conversa (`Print da conversa.png`).

Primeiro, abra o `TalkEncript.html` com dois cliques. Antes de tudo, o aplicativo pede autorização para usar a sua localização: clique em Permitir. A localização é obrigatória e precisa ter raio de no máximo 100 metros; se a permissão for negada, o aplicativo avisa e se encerra em 10 segundos. Na aba Operador, preencha o cadastro, incluindo a profissão e, se quiser, até dois links pessoais com título. Para teste, pode usar o CPF fictício 529.982.247-25, que é válido pelos dígitos verificadores, um celular como (91) 98888-7777 e qualquer e-mail. Se marcar que é advogado, informe o número da OAB e a seccional. Marque o consentimento e clique em Salvar cadastro.

Em seguida, na aba Gerar relatório, escolha WhatsApp como aplicativo, informe a versão do WhatsApp (no iPhone, em Configurações, Ajuda; no Android, em Configurações, Ajuda, Informações do app) e a data da conversa (01/10/2026, no exemplo). Em Interlocutores da conversa, preencha o nome e o telefone de cada participante, por exemplo Maria Souza, (91) 98888-7777, e João Lima, (91) 97777-6666; para conversas em grupo, use o botão Adicionar interlocutor para incluir quantos participantes forem necessários. Escreva a finalidade do relatório no campo próprio (por exemplo, instruir uma ação judicial) e informe o modelo do aparelho e o IMEI completo, que aparece ao discar *#06# no telefone (para teste, use o IMEI fictício 490154203237518); no Relatório constarão apenas os 4 primeiros e os 3 últimos dígitos. Preencha os demais campos que desejar e envie o arquivo `Conversa do WhatsApp com João Lima.zip`. No quadro de prints, envie o `Print da conversa.png` e, no campo Mensagem que aparece no print, escreva a mensagem como está no print, por exemplo `O valor combinado foi R$ 5.000,00`. Os prints são opcionais; quando forem juntados, cada um precisa da mensagem descrita, e os arquivos devem conter o texto da conversa exportada, para que a comparação seja feita. Marque a declaração e clique em Gerar relatório. No momento da geração, a localização é lida novamente; se o raio for maior que 100 metros, o relatório não é emitido e o sistema explica como ativar a localização precisa.

Ao final, o sistema baixa automaticamente um único arquivo zipado, com o nome Relatório Hash_ seguido do nome dos interlocutores (por exemplo, Relatório Hash_Maria Souza e João Lima.zip). Dentro dele estão o Relatório em PDF e em TXT, a transcrição integral da conversa em PDF (Conversa integral_TE-....pdf), os dados em JSON e todos os manifestos de verificação; nenhum arquivo é baixado solto. Se o download não começar, use o botão Baixar o pacote novamente. No PDF, confira que o print aparece com a miniatura e com a indicação de que o trecho foi encontrado na conversa, com o número da linha.

Para testar a verificação, vá à aba Verificar, selecione o arquivo `relatorio_TE-....json` do pacote e, em Arquivos a conferir, o ZIP da conversa e o print. O resultado deve ser Íntegro. Depois, faça uma cópia do print, abra em um editor de imagens, altere qualquer detalhe, salve e repita a verificação com a cópia alterada: o sistema apontará que o print foi alterado.

Para testar pelo terminal, siga o passo a passo da seção Como verificar se houve alteração do próprio Relatório: os comandos já vêm preenchidos com o nome e o hash do arquivo e respondem True ou OK quando ele está íntegro. Outra forma é extrair o pacote, coloque na mesma pasta o ZIP da conversa e execute `shasum -a 256 -c arquivos_TE-....sha256` no macOS ou `sha256sum -c arquivos_TE-....sha256` no Linux. No Windows, execute `Get-FileHash -Algorithm SHA256 "Conversa do WhatsApp com João Lima.zip"` no PowerShell e compare o resultado com o SHA-256 impresso no Relatório.

## Se aparecer "o arquivo não pôde ser lido"

Essa mensagem aparece quando um arquivo selecionado deixa de estar disponível antes de ser lido pelo navegador. As causas mais comuns são o arquivo ter sido movido, renomeado, apagado ou substituído depois de selecionado (por exemplo, a conversa foi exportada de novo com o mesmo nome), estar em uma pasta da nuvem que ainda não foi baixada para o computador (OneDrive, iCloud ou Google Drive) ou ter sido escolhido de dentro de um ZIP aberto no Explorador do Windows sem extrair. Para resolver, copie o arquivo para uma pasta comum do computador, como a Área de Trabalho, remova-o da lista do TalkEncript e selecione-o novamente.

## Como funciona

O usuário se cadastra como operador informando nome completo, profissão, endereço eletrônico, celular, CPF (validado pelos dígitos verificadores), os dados opcionais do escritório ou empresa (nome, endereço e CNPJ ou CPF, validado pelos dígitos verificadores), até dois links pessoais com título (por exemplo, o site do escritório e o perfil profissional) e, se for advogado, o número de inscrição na OAB e a seccional. O cadastro exige o consentimento previsto na LGPD e fica gravado somente no navegador do próprio operador.

Na geração, o operador informa os dados da conversa, envia os arquivos ou a pasta exportada, junta os prints se desejar e aceita a declaração de origem dos arquivos. O sistema solicita a geolocalização e, se a opção estiver marcada e houver internet, descreve o endereço por extenso (tipo de logradouro, logradouro, raio de localização, números de imóveis próximos, CEP, bairro, cidade, Estado e país) consultando o OpenStreetMap, para o qual são enviadas apenas as coordenadas. Em seguida, consulta a hora de referência do servidor (quando aberto pela internet), calcula o SHA-256 e o SHA-512 de cada arquivo, de cada item contido nos ZIPs e de cada print, confere o CRC-32 do ZIP, monta um resumo informativo da conversa e procura, no texto exportado, os trechos transcritos dos prints, ignorando acentos, maiúsculas e espaços.

O resultado é um pacote ZIP com o Relatório em PDF e em TXT, os dados completos em JSON, os manifestos `.sha256` e `.sha512` dos arquivos, o manifesto do conteúdo do ZIP, o manifesto dos prints e o arquivo `pacote_....sha256`, que contém o hash de todos os arquivos do pacote.

## O que consta do Relatório

O Relatório em PDF usa a cor institucional do sistema, o verde-oliva do símbolo do sistema, um ramo de oliveira (#556B2F), na faixa do cabeçalho, nas molduras, nos títulos e nas linhas divisórias; o texto é preto, em fonte Arial, com tamanho 10 nos textos gerais e mais importantes (títulos, parágrafos, passo a passo e hash master) e tamanho 9 nos itens de dados (rótulos e valores, hashes e comandos), e todo o texto, inclusive títulos, rótulos, hashes, comandos, rodapé e a Transcrição integral, é justificado. Todas as páginas têm uma faixa verde com o símbolo do sistema (ramo de oliveira, em branco), TALK ENCRIPT e a paginação. Na primeira página do Relatório, da Transcrição integral e do PDF dos prints, logo abaixo da faixa, o mesmo cabeçalho técnico, um quadro de identificação em grade de três colunas alinhadas, com cada rótulo em faixa clara e o valor abaixo, reúne o nome do relatório hash, o número do relatório, a data de geração, o operador, o CPF do operador, o motivo (profissão do operador) e os interlocutores numerados, cada um com o nome completo em uma linha e o número de telefone na linha de baixo; as demais páginas trazem apenas a faixa, sem repetir o quadro. O Relatório traz o número de identificação, o código de verificação (SHA-256 do arquivo JSON), a identificação completa do operador e a sua declaração, a finalidade informada pelo operador, a identificação da conversa (aplicativo e sua versão, modelo e IMEI mascarado do aparelho, data ou período da conversa e, para cada interlocutor, o nome completo em uma linha e o telefone na linha seguinte), a data e a hora de início e de conclusão (local, em UTC e com o fuso horário), a hora de referência do servidor e a diferença em relação ao relógio do dispositivo, a geolocalização com latitude, longitude, precisão, momento da leitura e o link de localização no Google Maps, o endereço por extenso com a fonte da consulta, os parâmetros criptográficos com o tamanho do resumo (chave) em bits, os metadados e os hashes de cada arquivo e de cada item dos ZIPs, o resumo da conversa, a seção Transcrição integral da conversa, que identifica o PDF com a reprodução integral, linha a linha e com a numeração das linhas, do arquivo de texto exportado pelo WhatsApp (emojis, que a fonte do PDF não desenha, aparecem com o código Unicode entre colchetes, como [U+1F600]), a seção Prints e comparação com a conversa exportada, que também identifica, com nome, tamanho e SHA-256, o PDF condensado dos prints (Prints_<número>.pdf ou, se dividido, Prints parte 1 de N_<número>.pdf, cada arquivo com até o tamanho máximo escolhido, 4 MB por padrão), e em que cada print aparece junto da sua comparação: logo abaixo da imagem estão a mensagem que o operador descreveu a partir do print, a linha da conversa exportada em que ela foi encontrada, com o trecho encontrado em negrito, e o resultado da comparação, seguidos do hash, das dimensões e dos demais dados técnicos do print, o registro cronológico da cadeia de custódia, a ferramenta utilizada com o hash do próprio código, o passo a passo de verificação para Windows, macOS e Linux, com comandos já preenchidos que respondem automaticamente se o arquivo está íntegro, a fundamentação normativa e as limitações e recomendações, com espaço para assinatura do operador.

## Fundamentação

Até 1/10/2026 o Conselho Nacional de Justiça não havia aprovado norma específica sobre hash ou cadeia de custódia da prova digital. A Portaria nº 391/2025 criou grupo de trabalho sobre o tema, e a minuta de resolução em análise prevê o registro de quem acessou o material, da ferramenta e do momento de cada procedimento, a preservação de metadados e o uso de hash. O Relatório adota esses requisitos, além dos previstos nos arts. 158-A a 158-F do Código de Processo Penal, na ABNT NBR ISO/IEC 27037:2013 e na jurisprudência do Superior Tribunal de Justiça. A pesquisa completa, com autor, link e data de acesso de cada fonte, está em [`docs/Fundamentacao_TalkEncript.docx`](docs/Fundamentacao_TalkEncript.docx), e um exemplo de Relatório está em [`docs/Exemplo_Relatório.pdf`](docs/Exemplo_Relatório.pdf).

## Publicação na internet (opcional)

O arquivo único dispensa publicação. Se quiser também um endereço na internet, por exemplo para uso no celular, a pasta `TalkEncript` pode ser publicada em qualquer hospedagem com HTTPS. Como este repositório é privado, o GitHub Pages só funciona com plano pago (GitHub Pro). Com o plano ativo, abra Settings, Pages e escolha GitHub Actions em Source; depois, em Settings, Secrets and variables, Actions, aba Variables, crie a variável `PUBLICAR_PAGES` com o valor `true`. A partir daí, cada atualização do branch `main` publica o sistema automaticamente, no endereço terminado em `/TalkEncript.html`.

Alternativas gratuitas são o Cloudflare Pages e o Netlify: basta criar uma conta, escolher a opção de enviar arquivos e enviar o `TalkEncript.html`.

## Para desenvolvedores

```bash
cd TalkEncript
npm install          # instala o esbuild, usado na montagem do arquivo único
npm test             # testes unitários (Node.js 20 ou superior)
npm run build        # gera TalkEncript.html, o SHA-256 e o pacote GestorLaw - TalkEncript V 2.1.zip
npm run e2e          # teste completo no Chromium, pelo servidor e pelo arquivo único
npm start            # servidor local: abra http://localhost:8080/codigo-fonte.html
```

O aplicativo para uso é o `TalkEncript.html`, montado a partir do `codigo-fonte.html` e das pastas `js`, `css` e `vendor`. Depois de alterar o código, execute `npm run build` para atualizar o `TalkEncript.html` e o pacote de download.

O fluxo `.github/workflows/talkencript.yml` executa os testes a cada alteração e disponibiliza o pacote GestorLaw - TalkEncript V 2.1 como artefato da execução.

## Publicar uma nova versão

As versões ficam em Releases do GitHub, com o pacote `GestorLaw-TalkEncript.zip`, o `TalkEncript.html` e o arquivo `SHA256SUMS.txt`. Para publicar uma nova versão, registre as novidades em uma nova seção do arquivo [NOVIDADES.md](NOVIDADES.md) (por exemplo, `## v2.1.0`), atualize o número da versão no aplicativo e crie a tag correspondente (`git tag v2.1.0` e `git push origin v2.1.0`). O fluxo `.github/workflows/release.yml` monta o aplicativo, executa os testes e cria a release automaticamente. O mesmo fluxo pode ser executado pela aba Actions, informando a versão e o commit de origem.

## Componentes de terceiros

hash-wasm 4.12.0, fflate 0.8.2, jsPDF 4.2.1 e pdf-lib 1.17.1 (usada para reunir os prints em PDF), todos com licença MIT, e a fonte Liberation Sans 2.1 (SIL OFL 1.1). O texto do Relatório em PDF é preto, justificado, em fonte Arial (tamanho 10 nos textos e 9 nos itens de dados), com títulos e destaques em verde-oliva; a fonte embutida é a Liberation Sans, de licença livre e com as mesmas métricas da Arial, porque a Arial é de propriedade da Microsoft e não pode ser redistribuída. As licenças estão na pasta `vendor`. Todos os componentes ficam embutidos no próprio sistema, sem dependência de sites externos.

## Sobre o criador

O GestorLaw - TalkEncript foi idealizado e desenvolvido pelo advogado paraense Carlos Alexandre Albuquerque Oliveira, inscrito na Ordem dos Advogados do Brasil, Seção do Pará, sob o nº 33.996. A ferramenta nasceu de uma necessidade concreta da prática forense: oferecer a advogados, peritos e demais profissionais do Direito um meio simples, que funciona em qualquer computador e sem instalação, de preservar conversas eletrônicas como prova, com cálculo de hash, registro da cadeia de custódia e relatório pronto para juntada aos autos.

Bacharel em Direito pela Estácio FAP (2019), com trabalho de conclusão de curso dedicado à falibilidade do reconhecimento de pessoas no processo criminal, obteve a habilitação na Ordem dos Advogados do Brasil em 2022. É especialista em Direito Penal e Criminologia pelo Instituto de Criminologia e Política Criminal (ICPC, 2021), em Direito Penal e Processo Penal pelo Centro Universitário Internacional (UNINTER, 2022) e em Direito e Processo do Trabalho, com ênfase em negócios, pela Universidade da Amazônia (UNAMA, 2024), e cursa especialização em Direito Tributário e Processo Tributário na Faculdade Legale.

Na advocacia, foi sócio do escritório Sampaio & Oliveira Advogados de 2020 a 2026, onde atuou como advogado criminalista e trabalhista em demandas consultivas e contenciosas e exerceu a coordenação geral, de planejamento e de marketing. Desde 2026 atua de forma autônoma, à frente de Carlos A. A. Oliveira, Assessoria e Consultoria Jurídica, nas áreas cível, trabalhista e penal, com ênfase em compliance empresarial e trabalhista, gestão jurídica e estruturação de programas de integridade corporativa.

A preocupação com a integridade da prova acompanha sua trajetória desde antes da advocacia. Ex-servidor público, atuou de 2017 a 2019 no Centro de Perícias Científicas Renato Chaves, no Pará, como assistente de coordenação, e reúne experiência no serviço público em gestão de unidades, cadeia de custódia, procedimentos administrativos e transferência de provas. No mesmo período, participou do Laboratório de Ciências Criminais do Instituto Brasileiro de Ciências Criminais (IBCCRIM). Complementou a formação com cursos sobre proteção de dados pessoais pela Escola Superior de Advocacia, sobre execução penal e compliance pela Escola Superior do Ministério Público da União e sobre o Sistema Eletrônico de Execução Unificado (SEEU) pelo Superior Tribunal de Justiça e pelo Conselho Nacional de Justiça.

O TalkEncript reúne essas duas vivências, a do serviço público voltado à prova e a da advocacia, em uma ferramenta que adota os arts. 158-A a 158-F do Código de Processo Penal, a norma ABNT NBR ISO/IEC 27037:2013 e a orientação do Superior Tribunal de Justiça sobre a prova digital.

Currículo Lattes: [https://lattes.cnpq.br/4151018791454248](https://lattes.cnpq.br/4151018791454248). ORCID: [https://orcid.org/0000-0003-0680-4424](https://orcid.org/0000-0003-0680-4424).
