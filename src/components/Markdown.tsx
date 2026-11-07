import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/** Zeigt Markdown mit Formeln (LaTeX via KaTeX) an. */
export default function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`markdown ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}>
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}

const DOLLAR = "$";

/** Wandelt \( \) und \[ \] in die Dollar-Schreibweise um, die remark-math versteht. */
export function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => DOLLAR + DOLLAR + m + DOLLAR + DOLLAR)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => DOLLAR + m + DOLLAR);
}
