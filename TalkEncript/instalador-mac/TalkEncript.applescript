-- TalkEncript para macOS: abre o aplicativo (arquivo único HTML) no navegador padrão.
on run
	set html to (POSIX path of (path to me)) & "Contents/Resources/TalkEncript.html"
	do shell script "open " & quoted form of html
end run
