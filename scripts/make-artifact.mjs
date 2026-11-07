// Bereitet den Build der claude.ai-Version zum Veröffentlichen als Artifact vor:
// - dist-artifact/lern-app.html: die Seite ohne <html>/<head>/<body> (claude.ai ergänzt das Gerüst)
// - dist-artifact/publish-files.json: Liste der Dateien, die mit veröffentlicht werden
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../dist-artifact/", import.meta.url).pathname;
const html = readFileSync(join(dir, "index.html"), "utf8");

const script = /<script type="module"[^>]*src="\.\/([^"]+)"/.exec(html)?.[1];
const style = /<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/.exec(html)?.[1];
if (!script || !style) throw new Error("Skript oder Stylesheet im Build nicht gefunden");

const page = `<title>Lern-App</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#4f46e5">
<link rel="stylesheet" href="${style}">
<div id="root"></div>
<script type="module" src="${script}"></script>
`;
writeFileSync(join(dir, "lern-app.html"), page);

// claude.ai nimmt keine Dateien mit rohen Steuerzeichen oder dem Ersatzzeichen U+FFFD an. In den
// JS-Bundles (pdf.js, micromark) stehen solche Zeichen nur in Zeichenketten-Konstanten; dort sind
// \xNN- bzw. \uFFFD-Escapes gleichwertig.
const SPECIAL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD]/;
for (const f of readdirSync(join(dir, "assets")).filter((f) => /\.m?js$/.test(f))) {
  const file = join(dir, "assets", f);
  const code = readFileSync(file, "utf8");
  if (!SPECIAL.test(code)) continue;
  let escaped = "";
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (!SPECIAL.test(ch)) {
      escaped += ch;
      continue;
    }
    let backslashes = 0;
    for (let j = i - 1; j >= 0 && code[j] === "\\"; j--) backslashes++;
    if (backslashes % 2 === 1) throw new Error(`${f}: Sonderzeichen nach Backslash an Position ${i}`);
    const c = ch.charCodeAt(0);
    escaped += c === 0xfffd ? "\\uFFFD" : "\\x" + c.toString(16).padStart(2, "0");
  }
  writeFileSync(file, escaped, "utf8");
  console.log(`${f}: Sonderzeichen maskiert`);
}

// KaTeX-Schriften liegen als woff2 im CSS; die woff/ttf-Ausweichdateien werden nicht gebraucht.
const files = ["icon.svg", ...readdirSync(join(dir, "assets")).filter((f) => !/\.(woff|ttf)$/.test(f)).map((f) => `assets/${f}`)];
writeFileSync(join(dir, "publish-files.json"), JSON.stringify(files, null, 2));
console.log(`lern-app.html geschrieben, ${files.length} Dateien zum Veröffentlichen.`);
