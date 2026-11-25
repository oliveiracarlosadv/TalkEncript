# Novidades do GestorLaw - TalkEncript

Cada versão publicada em Releases do GitHub traz as notas da seção correspondente abaixo.

## v2.1.0

GestorLaw - TalkEncript V 2.1: novo formato do relatório, no padrão dos relatórios técnicos de preservação de prova digital.

### Novo formato do relatório

- **Capa** com o título do relatório (novo campo, opcional), o identificador e o responsável (pessoa física, CPF, OAB e escritório).
- **Introdução** explicando o método, o que o relatório comprova e os seus limites.
- **Certificação**: selo da assinatura digital, hash master e **QR code do validador online**.
- **Detalhes do registro**: início, fim e tempo de sessão, em hora local e em UTC; fuso horário; ambiente (sistema e navegador); local da geração; arquivos analisados e arquivos gerados, cada um com SHA-256, SHA-512 e SHA3-512.
- **Prints em página inteira**, um por página (deitada quando o print é largo), com faixa técnica (arquivo, tamanho, data e hora do registro, códigos hash e origem) e a comparação com a conversa logo abaixo.
- **Vídeos** contidos na conversa exportada, em tabela, com a duração e a data de criação lidas do próprio arquivo de vídeo.
- **Metadados técnicos**: o ambiente de geração vai em arquivo próprio (ambiente_<identificador>.json), identificado por códigos hash.
- Cadeia de custódia em tabela, com cada ato em hora local e em UTC.
- Seções finais **Sobre o TalkEncript** (ambiente, conteúdos registrados, códigos hash, assinatura, escopo e fundamentação) e **Validação do registro** (validador online, verificação pelo pacote e validação manual, inclusive do SHA3-512 pelo openssl).
- Rodapé de todas as páginas com o identificador, o código de verificação e a paginação.

### Três códigos hash

Cada arquivo, item de ZIP e print passa a ter **SHA-256, SHA-512 e SHA3-512** (família SHA-3, norma FIPS 202). O pacote ganha o manifesto arquivos_<identificador>.sha3-512.

### Assinatura digital com certificado A1

Novo passo 5, opcional: assinar o relatório em PDF com o certificado digital A1 (.pfx ou .p12) do advogado, no padrão PAdES, no próprio computador. O certificado e a senha não saem do navegador e não são guardados. A assinatura pode ser conferida em validar.iti.gov.br e nos leitores de PDF.

### Validador online

O QR code do relatório abre a página pública de verificação (oliveiracarlosadv.github.io/TalkEncript-Verificar), que confere o pacote e os arquivos da conversa no navegador de quem recebe o relatório, sem enviar nada a servidor.

## v2.0.0

GestorLaw - TalkEncript V 2.0 (segunda versão).

### Relatório e documentos em PDF

O cabeçalho técnico foi reorganizado em todas as páginas do Relatório, da Conversa integral e dos Prints. No topo de cada página há uma faixa verde-oliva com o símbolo do sistema e a paginação. Na primeira página há um quadro de identificação em grade de três colunas alinhadas.

Todo o texto dos PDFs é justificado, com exceção dos comandos de verificação, que são reproduzidos exatamente como devem ser digitados.

Cada print aparece junto da sua comparação com a conversa exportada. Logo abaixo da imagem estão a mensagem descrita pelo operador e a linha da conversa em que ela foi encontrada, com o trecho encontrado em negrito.

### Prints

Os prints são condensados em um documento PDF para juntada aos autos, com até seis prints por página e a identificação de cada um ao final. O tamanho máximo de cada arquivo é escolhido pelo operador entre 2, 3, 4, 5 e 10 MB, com 4 MB por padrão. Quando os prints ultrapassam esse limite, o documento é dividido em partes.

### Interlocutores

Cada interlocutor aparece com o nome completo em uma linha e o telefone na linha seguinte. Também foi incluída a qualificação de cada um no caso, por exemplo Reclamante, Reclamado, Esposa ou Marido, e o campo de relação entre os interlocutores.

### Operador

O cadastro do operador ganhou campos opcionais de escritório ou empresa: nome, endereço e CNPJ ou CPF.

### Arquivos analisados

Cada ZIP informa a quantidade de arquivos que contém, no total e por extensão, por exemplo 44 arquivos *.jpg.

### Verificação de integridade

O pacote do relatório traz a página Verificar integridade, que confere todos os arquivos com dois cliques e arrastar e soltar, sem internet, e os verificadores pelo terminal verificar.sh (macOS e Linux) e verificar.bat (Windows), que conferem cada arquivo e pedem que o arquivo da conversa seja arrastado para a janela quando não o encontram. A primeira página do Relatório destaca o hash master, que é o SHA-256 do arquivo analisado. Logo abaixo vem um texto de síntese sobre como funciona o aplicativo. Ao final, o Relatório traz instruções de preservação do arquivo exportado.

### Verificação pelo terminal

A verificação pelo Terminal do macOS foi corrigida. Os manifestos e os comandos passam a usar o formato "hash *nome", aceito pelo macOS e pelo Linux, e os comandos não quebram de linha ao serem copiados do PDF.

### Aparência

O ramo de oliveira passou a ser o símbolo do aplicativo e o favicon, e o verde-oliva passou a ser a cor institucional.

## v1.0.0

GestorLaw - TalkEncript V 1.0 (primeira versão).

Primeira versão do aplicativo. Ela gera o Relatório de integridade de conversas exportadas, com os seguintes recursos:

- hashes SHA-256 e SHA-512 de cada arquivo e de cada item dos ZIPs;
- cadastro do operador;
- data e hora;
- localização precisa obrigatória, com endereço por extenso e link do Google Maps;
- registro da cadeia de custódia;
- transcrição integral da conversa em PDF;
- prints opcionais comparados com a conversa;
- passo a passo de verificação para Windows, macOS e Linux.
