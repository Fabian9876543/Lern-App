import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMath } from "../lib/markdown";

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
