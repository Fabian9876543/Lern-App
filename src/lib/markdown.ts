const DOLLAR = "$";
const FENCE = DOLLAR + DOLLAR;

/**
 * Bringt Formeln in die Schreibweise, die remark-math versteht:
 * \( \) und \[ \] werden zu Dollarzeichen, und eine Zeile, die nur aus
 * $$…$$ besteht, wird zu einem abgesetzten Formelblock (sonst zeigt
 * remark-math sie als Formel im Fließtext an).
 */
export function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => FENCE + m + FENCE)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => DOLLAR + m + DOLLAR)
    .replace(/^([ \t]*)\$\$([^\n$]+?)\$\$[ \t]*$/gm, (_, indent: string, m: string) =>
      [indent + FENCE, indent + m.trim(), indent + FENCE].join("\n"),
    );
}
