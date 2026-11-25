-- Desinstalador do TalkEncript para macOS.
on run
	display dialog "Deseja remover o TalkEncript deste Mac?" & return & return & "Serão apagados o aplicativo TalkEncript e este desinstalador. Os relatórios que você já gerou não são afetados." & return & return & "O cadastro do operador fica guardado no navegador e não é apagado." buttons {"Cancelar", "Desinstalar"} default button "Cancelar" cancel button "Cancelar" with title "Desinstalar TalkEncript" with icon caution
	do shell script "rm -rf '/Applications/TalkEncript.app' '/Applications/Desinstalar TalkEncript.app'; pkgutil --forget br.adv.caao.talkencript.pkg >/dev/null 2>&1; true" with administrator privileges
	display dialog "O TalkEncript foi removido deste Mac." buttons {"OK"} default button "OK" with title "Desinstalar TalkEncript"
end run
