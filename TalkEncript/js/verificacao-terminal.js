// Verificadores pelo terminal incluídos no pacote do relatório. Eles conferem o SHA-256
// de cada arquivo registrado sem que seja preciso copiar comandos do PDF: procuram os
// arquivos na pasta do pacote e na pasta acima dela e, quando não os encontram, pedem
// que o arquivo seja arrastado para a janela do terminal.
//   macOS e Linux: bash verificar.sh   (ou bash verificar.sh arquivo1 arquivo2 ...)
//   Windows: dois cliques em verificar.bat (que executa verificar.ps1)

export const GRUPOS = {
  pacote: 'Arquivos do pacote do relatório',
  conversa: 'Arquivos da conversa',
  zip: 'Itens de dentro do ZIP da conversa',
  print: 'Prints',
};

/** Itens registrados no relatório, na ordem em que são conferidos. */
export function verificationItems({ pacote = {}, arquivos = [], prints = [], zipFolderName }) {
  const itens = [];
  for (const [caminho, sha256] of Object.entries(pacote)) itens.push({ grupo: GRUPOS.pacote, tipo: 'pacote', caminho, sha256 });
  for (const f of arquivos) if (f.sha256) itens.push({ grupo: GRUPOS.conversa, tipo: 'conversa', caminho: f.path, sha256: f.sha256 });
  for (const f of prints) if (f.sha256) itens.push({ grupo: GRUPOS.print, tipo: 'print', caminho: f.path, sha256: f.sha256 });
  for (const f of arquivos) {
    for (const e of f.zipEntries ?? []) if (e.sha256) itens.push({ grupo: GRUPOS.zip, tipo: 'zip', caminho: `${zipFolderName(f.path)}/${e.path}`, sha256: e.sha256 });
  }
  return itens;
}

const shLine = (s) => String(s).replace(/[\r\n|]/g, ' ');

/** Script para macOS e Linux (sh/bash/zsh), com shasum ou sha256sum. */
export function buildShellScript({ id, versao, itens }) {
  const lista = itens.map((it) => `${it.sha256}|${it.tipo}|${shLine(it.grupo)}|${shLine(it.caminho)}`).join('\n');
  return `#!/bin/sh
# Verificação de integridade do Relatório nº ${id} (${versao}).
#
# COMO USAR NO macOS OU NO LINUX
# 1. Abra o Terminal.
# 2. Digite bash e um espaço, arraste este arquivo (verificar.sh) para a janela e pressione Enter.
# 3. O script confere os arquivos do pacote e procura os arquivos da conversa e os prints
#    nesta pasta e na pasta acima dela. Se não os encontrar, pede que você arraste cada
#    arquivo para a janela (ou apenas pressione Enter para pular).
# Também é possível indicar os arquivos diretamente: bash verificar.sh arquivo1 arquivo2

ORIGEM=$(pwd)
cd "$(dirname "$0")" || exit 1
if command -v sha256sum >/dev/null 2>&1; then
  calc() { sha256sum -b "$1" | cut -c1-64; }
else
  calc() { shasum -a 256 -b "$1" | cut -c1-64; }
fi
# Caminho arrastado para o terminal: retira espaços nas pontas, aspas e barras de escape.
limpa() { printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e "s/^'\\(.*\\)'$/\\1/" -e 's/^"\\(.*\\)"$/\\1/' -e 's/\\\\\\(.\\)/\\1/g'; }

LISTA='${lista.replace(/'/g, "'\\''")}'

ok=0; alt=0; aus=0; naozip=0; dirconv=""
echo "VERIFICAÇÃO DE INTEGRIDADE DO RELATÓRIO Nº ${id}"
echo "Cada arquivo é conferido pelo SHA-256 registrado no relatório."

if [ "$#" -gt 0 ]; then
  echo
  for arq in "$@"; do
    case "$arq" in /*) ;; *) arq="$ORIGEM/$arq" ;; esac
    if [ ! -f "$arq" ]; then echo "  NÃO ENCONTRADO  $arq"; aus=$((aus+1)); continue; fi
    h=$(calc "$arq")
    reg=$(printf '%s\\n' "$LISTA" | grep "^$h|" | head -n 1 | cut -d'|' -f4)
    if [ -n "$reg" ]; then echo "  ÍNTEGRO   $arq (idêntico a $reg)"; ok=$((ok+1));
    else echo "  NÃO CONFERE  $arq: SHA-256 $h não consta do relatório"; alt=$((alt+1)); fi
  done
else
  atual=""
  while IFS='|' read -r h tipo grupo caminho <&3; do
    [ -z "$h" ] && continue
    base=$(basename "$caminho")
    achado=""
    for p in "$caminho" "$base" "../$caminho" "../$base" "\${dirconv:-.}/$caminho"; do
      if [ -f "$p" ]; then achado="$p"; break; fi
    done
    if [ -z "$achado" ] && [ "$tipo" = "zip" ]; then naozip=$((naozip+1)); continue; fi
    if [ "$grupo" != "$atual" ]; then echo; echo "$grupo"; atual="$grupo"; fi
    if [ -z "$achado" ] && [ "$tipo" != "pacote" ] && [ -t 0 ]; then
      printf '  Arraste para esta janela o arquivo "%s" e pressione Enter (ou apenas Enter para pular): ' "$base"
      resp=""
      read -r resp </dev/tty || resp=""
      resp=$(limpa "$resp")
      if [ -n "$resp" ] && [ -f "$resp" ]; then achado="$resp"; fi
    fi
    if [ -z "$achado" ]; then echo "  AUSENTE   $caminho (não apresentado)"; aus=$((aus+1)); continue; fi
    # Os itens extraídos do ZIP também são procurados na pasta do arquivo da conversa.
    if [ "$tipo" = "conversa" ]; then dirconv=$(dirname "$achado"); fi
    if [ "$(calc "$achado")" = "$h" ]; then echo "  ÍNTEGRO   $caminho"; ok=$((ok+1));
    else echo "  ALTERADO  $caminho (o conteúdo não corresponde ao registrado)"; alt=$((alt+1)); fi
  done 3<<FIM
$LISTA
FIM
fi

echo
if [ "$naozip" -gt 0 ]; then echo "$naozip item(ns) de dentro do ZIP da conversa não foram conferidos; para conferi-los, extraia o ZIP na mesma pasta em que está o arquivo da conversa e execute de novo."; fi
if [ "$alt" -gt 0 ]; then
  echo "RESULTADO: ATENÇÃO, $alt arquivo(s) não correspondem ao registrado no relatório. $ok íntegro(s)."
  exit 1
elif [ "$ok" -gt 0 ]; then
  echo "RESULTADO: $ok arquivo(s) conferido(s), todos ÍNTEGROS, idênticos aos registrados no relatório."
  [ "$aus" -gt 0 ] && echo "$aus arquivo(s) não foram apresentados e, por isso, não foram conferidos."
  exit 0
else
  echo "RESULTADO: nenhum arquivo foi conferido."
  exit 2
fi
`;
}

const psString = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Script para o Windows (PowerShell 5.1 ou superior). */
export function buildPowerShellScript({ id, versao, itens }) {
  const lista = itens.map((it) => `  @{ h = '${it.sha256}'; t = '${it.tipo}'; g = ${psString(it.grupo)}; c = ${psString(it.caminho)} }`).join(",\n");
  return `# Verificação de integridade do Relatório nº ${id} (${versao}).
# COMO USAR NO WINDOWS: dê dois cliques no arquivo verificar.bat, que está na mesma pasta.
# O script confere os arquivos do pacote e procura os arquivos da conversa e os prints
# nesta pasta e na pasta acima dela. Se não os encontrar, pede que você arraste cada
# arquivo para a janela (ou apenas pressione Enter para pular).

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
# Arquivos indicados com caminho relativo são resolvidos antes de mudar de pasta.
$arquivos = @($args | ForEach-Object { if (Test-Path -LiteralPath $_) { (Resolve-Path -LiteralPath $_).Path } else { $_ } })
Set-Location -LiteralPath $PSScriptRoot
$itens = @(
${lista}
)
function Calc($p) { (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLower() }
$ok = 0; $alt = 0; $aus = 0; $naozip = 0; $dirconv = $null
Write-Host "VERIFICAÇÃO DE INTEGRIDADE DO RELATÓRIO Nº ${id}"
Write-Host 'Cada arquivo é conferido pelo SHA-256 registrado no relatório.'

if ($arquivos.Count -gt 0) {
  Write-Host ''
  foreach ($arq in $arquivos) {
    if (-not (Test-Path -LiteralPath $arq -PathType Leaf)) { Write-Host "  NÃO ENCONTRADO  $arq"; $aus++; continue }
    $h = Calc $arq
    $reg = $itens | Where-Object { $_.h -eq $h } | Select-Object -First 1
    if ($reg) { Write-Host "  ÍNTEGRO   $arq (idêntico a $($reg.c))" -ForegroundColor Green; $ok++ }
    else { Write-Host "  NÃO CONFERE  $($arq): SHA-256 $h não consta do relatório" -ForegroundColor Red; $alt++ }
  }
} else {
  $atual = ''
  foreach ($it in $itens) {
    $c = $it.c -replace '/', '\\'
    $base = Split-Path -Leaf $c
    $achado = $null
    $cands = @($c, $base, (Join-Path '..' $c), (Join-Path '..' $base))
    if ($dirconv) { $cands += (Join-Path $dirconv $c) }
    foreach ($p in $cands) {
      if (Test-Path -LiteralPath $p -PathType Leaf) { $achado = $p; break }
    }
    if (-not $achado -and $it.t -eq 'zip') { $naozip++; continue }
    if ($it.g -ne $atual) { Write-Host ''; Write-Host $it.g; $atual = $it.g }
    if (-not $achado -and $it.t -ne 'pacote') {
      $resp = Read-Host "  Arraste para esta janela o arquivo ""$base"" e pressione Enter (ou apenas Enter para pular)"
      $resp = ($resp -as [string]).Trim().Trim('"').Trim("'")
      if ($resp -and (Test-Path -LiteralPath $resp -PathType Leaf)) { $achado = $resp }
    }
    if (-not $achado) { Write-Host "  AUSENTE   $($it.c) (não apresentado)" -ForegroundColor Yellow; $aus++; continue }
    if ($it.t -eq 'conversa') { $dirconv = Split-Path -Parent (Resolve-Path -LiteralPath $achado).Path }
    if ((Calc $achado) -eq $it.h) { Write-Host "  ÍNTEGRO   $($it.c)" -ForegroundColor Green; $ok++ }
    else { Write-Host "  ALTERADO  $($it.c) (o conteúdo não corresponde ao registrado)" -ForegroundColor Red; $alt++ }
  }
}

Write-Host ''
if ($naozip -gt 0) { Write-Host "$naozip item(ns) de dentro do ZIP da conversa não foram conferidos; para conferi-los, extraia o ZIP na mesma pasta em que está o arquivo da conversa e execute de novo." }
if ($alt -gt 0) { Write-Host "RESULTADO: ATENÇÃO, $alt arquivo(s) não correspondem ao registrado no relatório. $ok íntegro(s)." -ForegroundColor Red; $code = 1 }
elseif ($ok -gt 0) {
  Write-Host "RESULTADO: $ok arquivo(s) conferido(s), todos ÍNTEGROS, idênticos aos registrados no relatório." -ForegroundColor Green
  if ($aus -gt 0) { Write-Host "$aus arquivo(s) não foram apresentados e, por isso, não foram conferidos." }
  $code = 0
} else { Write-Host 'RESULTADO: nenhum arquivo foi conferido.'; $code = 2 }
exit $code
`;
}

/** Atalho de dois cliques para o Windows. */
export function buildBatch() {
  return [
    '@echo off',
    'chcp 65001 >nul',
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0verificar.ps1" %*',
    'echo.',
    'pause',
    '',
  ].join('\r\n');
}
