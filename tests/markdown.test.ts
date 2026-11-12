import katex from "katex";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Markdown from "../src/components/Markdown";
import { normalizeMath } from "../src/lib/markdown";

const render = (md: string) => renderToStaticMarkup(createElement(Markdown, null, md));

describe("Formeln", () => {
  it("macht aus einer $$-Zeile einen abgesetzten Block", () => {
    expect(normalizeMath("Text\n$$a = b$$\nweiter")).toBe("Text\n$$\na = b\n$$\nweiter");
    expect(normalizeMath("- Punkt\n\n  $$x^2$$")).toBe("- Punkt\n\n  $$\n  x^2\n  $$");
    expect(normalizeMath("inline $$a$$ im Satz")).toBe("inline $$a$$ im Satz");
    expect(normalizeMath(String.raw`\[ \frac{1}{2} \]`)).toBe("$$\n\\frac{1}{2}\n$$");
    expect(normalizeMath(String.raw`Sei \(x>0\).`)).toBe("Sei $x>0$.");
  });

  it("zeigt abgesetzte Formeln als Block und Inline-Formeln im Text", () => {
    const html = render("Das ist $a+b$.\n\n$$\\frac{a}{b}$$\n\nDanach.");
    expect(html.match(/katex-display/g)).toHaveLength(1);
    expect(html.match(/class="katex"/g)).toHaveLength(2);
  });

  it("nutzt die Klassennamen, die das eingebundene KaTeX-CSS kennt", () => {
    // Renderer (rehype-katex) und Stylesheet (katex/dist/katex.min.css) müssen dieselbe KaTeX-Version haben.
    // Das Stylesheet stammt aus dem Paket „katex“; dessen eigene Ausgabe zeigt, welche Klassen es kennt.
    const html = render("$x_{\\text{nominal}}$");
    const reference = katex.renderToString("x_{\\text{nominal}}");
    const sizing = reference.match(/class="([^"]*size3[^"]*)"/)![1];
    expect(html).toContain(`class="${sizing}"`);
  });
});
