<p align="center">
  <img src="TalkEncript/img/icone-app.png" alt="Símbolo do TalkEncript: ramo de oliveira" width="96" height="96">
</p>

<h1 align="center">TalkEncript</h1>

<p align="center"><strong>Relatório de integridade de conversas exportadas, com hash e cadeia de custódia. Os arquivos nunca saem do seu computador.</strong></p>

<p align="center">GestorLaw - TalkEncript V 2.1 (segunda versão)</p>

## Baixar e usar

| Sistema | Download |
| :---: | :---: |
| **Windows 10/11** | [GestorLaw - TalkEncript V 2.1.zip](https://github.com/oliveiracarlosadv/TalkEncript/raw/main/TalkEncript/GestorLaw%20-%20TalkEncript%20V%202.1.zip) |
| **macOS** (Apple Silicon e Intel) | [TalkEncript-Instalador-macOS.pkg](https://github.com/oliveiracarlosadv/TalkEncript/releases/latest/download/TalkEncript-Instalador-macOS.pkg) (assistente: Continuar, Instalar, Fechar) ou o mesmo [.zip](https://github.com/oliveiracarlosadv/TalkEncript/raw/main/TalkEncript/GestorLaw%20-%20TalkEncript%20V%202.1.zip) |
| **Linux** | [GestorLaw - TalkEncript V 2.1.zip](https://github.com/oliveiracarlosadv/TalkEncript/raw/main/TalkEncript/GestorLaw%20-%20TalkEncript%20V%202.1.zip) |

1. Baixe o pacote da versão mais recente e extraia em uma pasta do computador.
2. Dê dois cliques em **TalkEncript.html**. O aplicativo abre no navegador que você já usa (Chrome, Edge, Firefox ou Safari).
3. Autorize a localização, faça o cadastro do operador e, na aba **Gerar relatório**, envie a conversa exportada.

No Mac, o instalador coloca o **TalkEncript** e o **Desinstalar TalkEncript** em Aplicativos. Para remover, abra o
**Desinstalar TalkEncript** (também em [TalkEncript-Desinstalador-macOS.zip](https://github.com/oliveiracarlosadv/TalkEncript/releases/latest/download/TalkEncript-Desinstalador-macOS.zip)).
Na primeira abertura, se o Mac avisar que o desenvolvedor não foi identificado: Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim.
Para conferir os arquivos baixados: [SHA256SUMS.txt](https://github.com/oliveiracarlosadv/TalkEncript/releases/latest/download/SHA256SUMS.txt).

As novidades de cada versão estão em [NOVIDADES.md](TalkEncript/NOVIDADES.md).

> Não é preciso instalar nada. O mesmo pacote serve para Windows, macOS e Linux: o TalkEncript é um arquivo único, que traz dentro de si todo o aplicativo. O cálculo dos hashes e a montagem do relatório acontecem no próprio navegador, e nenhum arquivo da conversa é enviado pela internet. A localização é obrigatória e precisa ser precisa (raio de até 100 metros). O LEIA-ME do pacote explica como conferir que a cópia do aplicativo é original.

## Como funciona

O TalkEncript calcula, no próprio computador do operador e sem enviar os arquivos pela internet, o hash (impressão digital criptográfica, nos algoritmos SHA-256 e SHA-512) de cada arquivo da conversa exportada e de cada print juntado, e registra quem gerou o relatório, a data, a hora e a localização da geração.

O hash depende somente do conteúdo do arquivo: a alteração de um único caractere, imagem ou áudio produz um hash completamente diferente. Por isso, para comprovar que um arquivo apresentado é o mesmo examinado no relatório, basta recalcular o seu hash e compará-lo com o **hash master**, que aparece em destaque na primeira página do relatório. Se forem iguais, o arquivo é idêntico.

O pacote do relatório traz a página Verificar integridade e os verificadores pelo terminal, que fazem essa conferência automaticamente, e o relatório termina com as instruções para preservar o arquivo exportado exatamente como foi exportado.

## O que o TalkEncript faz

O TalkEncript gera o Relatório de integridade de conversas exportadas do WhatsApp, do Telegram e de outros aplicativos, com ou sem mídia. Ao final, baixa um único pacote ZIP com:

| Arquivo | Conteúdo |
| --- | --- |
| **Relatório** (PDF, TXT e JSON) | Hashes SHA-256 e SHA-512 de cada arquivo e de cada item dos ZIPs, operador, data, hora, geolocalização, endereço por extenso, link do Google Maps, cadeia de custódia, comparação dos prints com a conversa e passo a passo de verificação para Windows, macOS e Linux |
| **Conversa integral** (PDF) | Reprodução integral, linha a linha e numerada, do arquivo de texto exportado |
| **Prints** (PDF) | Prints condensados para juntada aos autos, com até seis por página e tamanho máximo escolhido (4 MB por padrão), divididos em partes quando necessário |
| **Manifestos** (.sha256 e .sha512) | Conferência automática de todos os arquivos pelo terminal |

Exemplos: [Relatório](TalkEncript/docs/Exemplo_Relatório.pdf), [Conversa integral](TalkEncript/docs/Exemplo_Conversa%20integral.pdf) e [Prints](TalkEncript/docs/Exemplo_Prints.pdf).

## Como conferir um relatório

Qualquer pessoa pode conferir, sem o TalkEncript e sem internet, se um arquivo é idêntico ao registrado no relatório. Na pasta do arquivo, execute o comando do seu sistema e compare o resultado com o SHA-256 do relatório:

| Sistema | Comando |
| --- | --- |
| **Windows** (PowerShell) | `Get-FileHash -Algorithm SHA256 'Conversa.zip'` |
| **macOS** (Terminal) | `shasum -a 256 'Conversa.zip'` |
| **Linux** | `sha256sum 'Conversa.zip'` |

Para conferir tudo de uma vez, o pacote do relatório traz a página **Verificar integridade** (dois cliques, arrastar os arquivos) e os verificadores pelo terminal: no macOS e no Linux, digite `bash ` e arraste o arquivo `verificar.sh` para o Terminal; no Windows, dê dois cliques em `verificar.bat`. O verificador confere cada arquivo e pede que o arquivo da conversa seja arrastado para a janela quando não o encontra. A documentação completa está no [README do TalkEncript](TalkEncript/README.md).

## Sobre o criador

O GestorLaw - TalkEncript foi criado por **Carlos Alexandre Albuquerque Oliveira**, advogado (OAB/PA 33.996), especialista em Direito Penal e Criminologia, em Direito Penal e Processo Penal e em Direito e Processo do Trabalho, ex-servidor público com experiência em cadeia de custódia e transferência de provas, que atua nas áreas cível, trabalhista e penal, com ênfase em compliance.

[Currículo Lattes](https://lattes.cnpq.br/4151018791454248) | [ORCID](https://orcid.org/0000-0003-0680-4424) | [Sobre o criador, em detalhes](TalkEncript/README.md#sobre-o-criador)

## Licença

**Código aberto, licença [MIT](LICENSE)** — desde 25/11/2026. Gratuito, sem planos pagos: qualquer pessoa pode usar, estudar, modificar e redistribuir. As bibliotecas embutidas mantêm as próprias licenças (pasta `TalkEncript/vendor`).

Lex Tecnologias — *Tecnologia de advogado para advogado.*
