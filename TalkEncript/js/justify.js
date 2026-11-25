// Texto justificado para os PDFs do TalkEncript (Relatório e Transcrição integral).

/**
 * Desenha uma linha justificada entre x e x + maxWidth. O espaço sobrante é distribuído
 * entre as palavras; numa linha sem espaços (hash, comando, endereço de internet), entre
 * os caracteres. A última linha de cada parágrafo fica alinhada à esquerda, como na
 * justificação usual.
 */
export function justifyText(doc, line, x, baseline, maxWidth, last) {
  const text = line.trim();
  const natural = doc.getTextWidth(text);
  if (last || !text || natural >= maxWidth) { doc.text(line, x, baseline); return; }
  const words = text.split(/\s+/);
  if (words.length < 2) {
    const n = [...text].length;
    if (n < 2) doc.text(text, x, baseline);
    else doc.text(text, x, baseline, { charSpace: (maxWidth - natural) / (n - 1) });
    return;
  }
  const used = words.reduce((n, w) => n + doc.getTextWidth(w), 0);
  const gap = (maxWidth - used) / (words.length - 1);
  let cx = x;
  for (const w of words) {
    doc.text(w, cx, baseline);
    cx += doc.getTextWidth(w) + gap;
  }
}
