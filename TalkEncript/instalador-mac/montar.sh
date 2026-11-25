#!/bin/bash
# Monta o instalador do TalkEncript para macOS (assistente "Continuar, Instalar, Fechar").
# Uso: bash instalador-mac/montar.sh [pasta de saída]   (padrão: TalkEncript/dist)
# Requer: TalkEncript.html já montado (npm run build). Usa só ferramentas do macOS.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"
SAIDA="${1:-$RAIZ/dist}"
VERSAO="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$RAIZ/package.json")"
ID="br.adv.caao.talkencript"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

test -f "$RAIZ/TalkEncript.html" || { echo "Falta TalkEncript.html: rode npm run build"; exit 1; }
mkdir -p "$SAIDA" "$TMP/raiz" "$TMP/pkgs" "$TMP/recursos"

# Ícone (ramo de oliveira) a partir de img/icone-app.png
ICONSET="$TMP/icone.iconset"; mkdir "$ICONSET"
for t in 16 32 128 256; do
  sips -z $t $t "$RAIZ/img/icone-app.png" --out "$ICONSET/icon_${t}x${t}.png" >/dev/null
  sips -z $((t*2)) $((t*2)) "$RAIZ/img/icone-app.png" --out "$ICONSET/icon_${t}x${t}@2x.png" >/dev/null
done
cp "$RAIZ/img/icone-app.png" "$ICONSET/icon_512x512.png"
iconutil -c icns "$ICONSET" -o "$TMP/icone.icns"

# Cria um app a partir de um AppleScript: $1 script, $2 nome do app, $3 identificador
criar_app() {
  local app="$TMP/raiz/$2.app"
  osacompile -o "$app" "$1"
  rm -f "$app/Contents/Resources/Assets.car"
  cp "$TMP/icone.icns" "$app/Contents/Resources/applet.icns"
  local p="$app/Contents/Info.plist"
  plutil -remove CFBundleIconName "$p" 2>/dev/null || true
  plutil -replace CFBundleIdentifier -string "$3" "$p"
  plutil -replace CFBundleName -string "$2" "$p"
  plutil -replace CFBundleShortVersionString -string "$VERSAO" "$p"
  plutil -replace CFBundleVersion -string "$VERSAO" "$p"
  plutil -replace NSHumanReadableCopyright -string "Carlos Alexandre Albuquerque Oliveira" "$p"
}

criar_app "$AQUI/TalkEncript.applescript" "TalkEncript" "$ID"
cp "$RAIZ/TalkEncript.html" "$RAIZ/TalkEncript.html.sha256" "$TMP/raiz/TalkEncript.app/Contents/Resources/"
criar_app "$AQUI/Desinstalar.applescript" "Desinstalar TalkEncript" "$ID.desinstalar"

# Assinatura local (sem certificado da Apple): necessária para rodar no Apple Silicon
for app in "$TMP/raiz/"*.app; do
  xattr -cr "$app"
  codesign --force --deep --sign - "$app"
done

# Pacote: instala os dois apps em /Applications, sempre no mesmo lugar
pkgbuild --analyze --root "$TMP/raiz" "$TMP/componente.plist" >/dev/null
for i in 0 1; do plutil -replace $i.BundleIsRelocatable -bool NO "$TMP/componente.plist"; done
pkgbuild --root "$TMP/raiz" --component-plist "$TMP/componente.plist" \
  --identifier "$ID.pkg" --version "$VERSAO" --install-location /Applications \
  "$TMP/pkgs/talkencript-componente.pkg" >/dev/null
sed "s/__VERSAO__/$VERSAO/g" "$AQUI/Distribution.xml" > "$TMP/Distribution.xml"
for f in "$AQUI/recursos/"*.html; do sed "s/__VERSAO__/$VERSAO/g" "$f" > "$TMP/recursos/$(basename "$f")"; done

PKG="$SAIDA/TalkEncript-Instalador-macOS.pkg"
productbuild --distribution "$TMP/Distribution.xml" --resources "$TMP/recursos" \
  --package-path "$TMP/pkgs" "$PKG" >/dev/null

# Desinstalador avulso (para quem já apagou o atalho de Aplicativos)
rm -f "$SAIDA/TalkEncript-Desinstalador-macOS.zip"
ditto -c -k --keepParent "$TMP/raiz/Desinstalar TalkEncript.app" "$SAIDA/TalkEncript-Desinstalador-macOS.zip"

echo "$PKG"
echo "$SAIDA/TalkEncript-Desinstalador-macOS.zip"
