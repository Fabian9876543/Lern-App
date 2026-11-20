// Schriftdateien für den PDF-Export. Sie stecken (base64) in diesem nachgeladenen
// Modul, damit sie nur geladen werden, wenn wirklich ein PDF erstellt wird.
import mono from "../../assets/pdf-fonts/mono-regular.ttf?inline";
import monoBold from "../../assets/pdf-fonts/mono-bold.ttf?inline";
import sansBold from "../../assets/pdf-fonts/sans-bold.ttf?inline";
import sansBoldItalic from "../../assets/pdf-fonts/sans-bolditalic.ttf?inline";
import sansItalic from "../../assets/pdf-fonts/sans-italic.ttf?inline";
import sans from "../../assets/pdf-fonts/sans-regular.ttf?inline";
import sym from "../../assets/pdf-fonts/sym-regular.ttf?inline";
import ams from "katex/dist/fonts/KaTeX_AMS-Regular.ttf?inline";
import calBold from "katex/dist/fonts/KaTeX_Caligraphic-Bold.ttf?inline";
import cal from "katex/dist/fonts/KaTeX_Caligraphic-Regular.ttf?inline";
import frakBold from "katex/dist/fonts/KaTeX_Fraktur-Bold.ttf?inline";
import frak from "katex/dist/fonts/KaTeX_Fraktur-Regular.ttf?inline";
import mainBold from "katex/dist/fonts/KaTeX_Main-Bold.ttf?inline";
import mainBoldItalic from "katex/dist/fonts/KaTeX_Main-BoldItalic.ttf?inline";
import mainItalic from "katex/dist/fonts/KaTeX_Main-Italic.ttf?inline";
import main from "katex/dist/fonts/KaTeX_Main-Regular.ttf?inline";
import mathBoldItalic from "katex/dist/fonts/KaTeX_Math-BoldItalic.ttf?inline";
import mathItalic from "katex/dist/fonts/KaTeX_Math-Italic.ttf?inline";
import sfBold from "katex/dist/fonts/KaTeX_SansSerif-Bold.ttf?inline";
import sfItalic from "katex/dist/fonts/KaTeX_SansSerif-Italic.ttf?inline";
import sf from "katex/dist/fonts/KaTeX_SansSerif-Regular.ttf?inline";
import script from "katex/dist/fonts/KaTeX_Script-Regular.ttf?inline";
import size1 from "katex/dist/fonts/KaTeX_Size1-Regular.ttf?inline";
import size2 from "katex/dist/fonts/KaTeX_Size2-Regular.ttf?inline";
import size3 from "katex/dist/fonts/KaTeX_Size3-Regular.ttf?inline";
import size4 from "katex/dist/fonts/KaTeX_Size4-Regular.ttf?inline";
import tt from "katex/dist/fonts/KaTeX_Typewriter-Regular.ttf?inline";
import type { FontBytes, FontId } from "./fonts";

const DATA: Record<FontId, string> = {
  sans,
  "sans-bold": sansBold,
  "sans-italic": sansItalic,
  "sans-bolditalic": sansBoldItalic,
  sym,
  mono,
  "mono-bold": monoBold,
  "KaTeX_AMS-Regular": ams,
  "KaTeX_Caligraphic-Bold": calBold,
  "KaTeX_Caligraphic-Regular": cal,
  "KaTeX_Fraktur-Bold": frakBold,
  "KaTeX_Fraktur-Regular": frak,
  "KaTeX_Main-Bold": mainBold,
  "KaTeX_Main-BoldItalic": mainBoldItalic,
  "KaTeX_Main-Italic": mainItalic,
  "KaTeX_Main-Regular": main,
  "KaTeX_Math-BoldItalic": mathBoldItalic,
  "KaTeX_Math-Italic": mathItalic,
  "KaTeX_SansSerif-Bold": sfBold,
  "KaTeX_SansSerif-Italic": sfItalic,
  "KaTeX_SansSerif-Regular": sf,
  "KaTeX_Script-Regular": script,
  "KaTeX_Size1-Regular": size1,
  "KaTeX_Size2-Regular": size2,
  "KaTeX_Size3-Regular": size3,
  "KaTeX_Size4-Regular": size4,
  "KaTeX_Typewriter-Regular": tt,
};

function decode(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cache: FontBytes | null = null;
export function pdfFonts(): FontBytes {
  cache ??= Object.fromEntries(Object.entries(DATA).map(([id, url]) => [id, decode(url)])) as FontBytes;
  return cache;
}
