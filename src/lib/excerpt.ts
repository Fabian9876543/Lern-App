import type { MaterialRole } from "../types";

/**
 * Auszug aus zu viel Material: claude.ai nimmt pro Anfrage höchstens 256 KB
 * Text. Ist die Auswahl größer, stellt die App selbst einen Auszug zusammen –
 * ohne zusätzliche Anfragen an Claude. Wie ausgewählt wird, hängt vom Zweck ab:
 *
 * - "coverage":  von jeder Seite bzw. jedem Abschnitt der Anfang (Überblick, z. B. Lernplan-Themen)
 * - "prefix":    von jedem Material der Anfang, gleich großer Anteil (Originalaufgaben: Aufgaben und
 *                Lösungen bleiben zueinander passend)
 * - "relevance": die Abschnitte, die am besten zu einem Thema passen (Übungstests, Lernzettel)
 * - "sample":    zufällig verteilte Abschnitte aus allen Materialien (neue Aufgaben ohne Thema)
 */

export interface SourceMaterial {
  label: string;
  role: MaterialRole;
  body: string;
}

export type ExcerptStrategy =
  | { kind: "coverage" }
  | { kind: "prefix" }
  | { kind: "relevance"; query: string; seed?: number }
  | { kind: "sample"; seed: number };

export interface Excerpt {
  parts: { label: string; body: string }[];
  /** Anteil des Textes, der im Auszug steckt (0–1). */
  share: number;
  /** Hinweis für Claude und die Lernenden – null, wenn alles passt. */
  note: string | null;
}

const encoder = new TextEncoder();
export const byteLength = (s: string) => encoder.encode(s).length;

/** Umrahmung eines Materials im Prompt (wird mitgezählt). */
export function wrapMaterial(label: string, body: string): string {
  return `<material titel="${label}">\n${body}\n</material>`;
}

const GAP = "[…]";
const PAGE_MARKER = /^--- Seite (\d+) ---$/m;

interface Block {
  m: number;
  i: number;
  page?: number;
  text: string;
  bytes: number;
  /** Verweist auf ein beigefügtes Bild – bleibt immer im Auszug. */
  keep: boolean;
}

/** Zerlegt einen Materialtext in Abschnitte: Seiten (bei PDFs) oder Absatzgruppen von etwa `target` Zeichen. */
export function splitBlocks(body: string, target = 3000): { page?: number; text: string }[] {
  if (PAGE_MARKER.test(body)) {
    const out: { page?: number; text: string }[] = [];
    const re = /^--- Seite (\d+) ---$/gm;
    const hits = [...body.matchAll(re)];
    const before = body.slice(0, hits[0].index).trim();
    if (before) out.push({ text: before });
    hits.forEach((h, k) => {
      const end = k + 1 < hits.length ? hits[k + 1].index! : body.length;
      for (const piece of splitLong(body.slice(h.index!, end).trim(), target * 2)) out.push({ page: Number(h[1]), text: piece });
    });
    return out;
  }
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim());
  const out: { text: string }[] = [];
  let current = "";
  for (const p of paragraphs) {
    for (const piece of splitLong(p, target * 2)) {
      if (current && current.length + piece.length > target) {
        out.push({ text: current });
        current = "";
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) out.push({ text: current });
  return out;
}

/** Sehr lange Stücke an Zeilenenden teilen. */
function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Anfang eines Textes mit höchstens `maxBytes` Bytes, an einer Zeilen- oder Wortgrenze. */
export function headOf(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text;
  // Zeichen grob über das Verhältnis Bytes/Zeichen schätzen, dann nachjustieren
  let chars = Math.floor((maxBytes / byteLength(text)) * text.length);
  while (chars > 0 && byteLength(text.slice(0, chars)) > maxBytes) chars = Math.floor(chars * 0.95);
  const slice = text.slice(0, chars);
  const cut = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
  return (cut > 0 && cut >= chars * 0.5 ? slice.slice(0, cut) : slice).trimEnd();
}

// ---------- Relevanz ----------

const normalizeWord = (w: string) => w.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

const STOPWORDS = new Set(
  (
    "der die das den dem des ein eine einer eines einem einen und oder aber auch als wie mit von vom zu zum zur im in " +
    "ins auf an am aus bei für fur über uber unter nach vor bis durch ohne gegen um ist sind war wird werden wurde " +
    "kann können muss nicht kein keine nur noch schon sehr mehr man sich sie er es wir ihr ich du dass ob wenn dann " +
    "thema themen übungstest uebungstest test aufgabe aufgaben frage fragen kurze nur dieses diesem zur wiederholung " +
    "kernpunkte prüfe pruefe wichtigsten hinweise lernenden prüfung pruefung fundstelle the and of to for with"
  )
    .split(" ")
    .map(normalizeWord),
);

/** Wortstämme (grob): klein, ohne Umlautunterschiede, die ersten 6 Zeichen. */
export function terms(text: string): string[] {
  return (normalizeWord(text).match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter((w) => !STOPWORDS.has(w))
    .map((w) => w.slice(0, 6));
}

function relevanceScores(blocks: Block[], query: string): number[] {
  const q = [...new Set(terms(query))];
  if (q.length === 0) return blocks.map(() => 0);
  const counts = blocks.map((b) => {
    const c = new Map<string, number>();
    for (const t of terms(b.text)) c.set(t, (c.get(t) ?? 0) + 1);
    return c;
  });
  const df = new Map(q.map((t) => [t, counts.filter((c) => c.has(t)).length]));
  return counts.map((c, k) => {
    let score = 0;
    for (const t of q) {
      const n = c.get(t) ?? 0;
      if (n) score += Math.log(1 + n) * Math.log(1 + blocks.length / (df.get(t) || 1));
    }
    // Lange Abschnitte nicht bevorzugen
    return score / Math.sqrt(Math.max(1, blocks[k].bytes / 1500));
  });
}

/** Kleiner, reproduzierbarer Zufall (für Varianten). */
function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ---------- Auszug ----------

/**
 * Stellt aus den Materialien einen Auszug zusammen, der (samt Umrahmung) in
 * `budget` Bytes passt. Passt alles, kommt alles unverändert zurück.
 */
export function makeExcerpt(materials: SourceMaterial[], budget: number, strategy: ExcerptStrategy): Excerpt {
  const full = materials.map((m) => wrapMaterial(m.label, m.body));
  const totalBytes = full.reduce((s, t) => s + byteLength(t) + 2, 0);
  if (totalBytes <= budget) return { parts: materials.map((m) => ({ label: m.label, body: m.body })), share: 1, note: null };

  const blocks: Block[] = [];
  materials.forEach((m, mi) =>
    splitBlocks(m.body).forEach((b, i) =>
      blocks.push({ m: mi, i, page: b.page, text: b.text, bytes: byteLength(b.text) + 2, keep: /\[(?:eingescannte Seite: )?Bild \d+ – siehe beigefügte Bilder\]/.test(b.text) }),
    ),
  );
  const wrapperBytes = materials.reduce((s, m) => s + byteLength(wrapMaterial(m.label, GAP)) + 2, 0);
  const room = Math.max(0, budget - wrapperBytes);
  const textBytes = blocks.reduce((s, b) => s + b.bytes, 0);
  const chosen = new Map<Block, string>(); // Block -> übernommener Text (ggf. gekürzt)
  let used = 0;
  const take = (b: Block, text = b.text) => {
    chosen.set(b, text);
    used += byteLength(text) + 2;
  };
  for (const b of blocks.filter((x) => x.keep)) take(b);

  const rest = blocks.filter((b) => !b.keep);
  const ratio = Math.max(0, (room - used) / Math.max(1, rest.reduce((s, b) => s + b.bytes, 0)));

  if (strategy.kind === "coverage") {
    // Von jedem Abschnitt der Anfang – gleicher Anteil, mindestens ein paar Zeilen.
    for (const b of rest) {
      const share = Math.floor(b.bytes * ratio * 0.97);
      if (share >= 80) take(b, headOf(b.text, share));
    }
  } else if (strategy.kind === "prefix") {
    // Von jedem Material der Anfang, gleich großer Anteil.
    materials.forEach((_, mi) => {
      const own = rest.filter((b) => b.m === mi);
      let quota = Math.floor(own.reduce((s, b) => s + b.bytes, 0) * ratio * 0.97);
      for (const b of own) {
        if (quota <= 80) break;
        const text = b.bytes <= quota ? b.text : headOf(b.text, quota);
        take(b, text);
        quota -= byteLength(text) + 2;
      }
    });
  } else {
    // Ganze Abschnitte nach Rangfolge, solange Platz ist.
    const rnd = random(strategy.seed ?? 1);
    let order: Block[];
    if (strategy.kind === "relevance") {
      const scores = relevanceScores(rest, strategy.query);
      const jitter = rest.map(() => rnd() * 1e-6);
      order = rest.map((b, k) => ({ b, s: scores[k] + jitter[k] })).sort((x, y) => y.s - x.s).map((x) => x.b);
    } else {
      // Zufällig, aber gleichmäßig über die Materialien verteilt (reihum)
      const perMaterial = materials.map((_, mi) => rest.filter((b) => b.m === mi).sort(() => rnd() - 0.5));
      order = [];
      for (let round = 0; perMaterial.some((l) => l.length > round); round++) {
        for (const list of perMaterial) if (list[round]) order.push(list[round]);
      }
    }
    for (const b of order) if (used + b.bytes <= room) take(b);
  }

  const parts = materials.map((m, mi) => {
    const own = blocks.filter((b) => b.m === mi);
    const pieces: string[] = [];
    let last = -1;
    for (const b of own) {
      const text = chosen.get(b);
      if (text === undefined) continue;
      if (b.i !== last + 1) pieces.push(GAP);
      pieces.push(text + (text !== b.text ? ` ${GAP}` : ""));
      last = b.i;
    }
    if (last !== own.length - 1 && own.length) pieces.push(GAP);
    return { label: m.label, body: pieces.length ? pieces.join("\n\n") : `${GAP} (nicht im Auszug enthalten)` };
  });
  const keptBytes = [...chosen.values()].reduce((s, t) => s + byteLength(t), 0);
  const share = Math.min(1, keptBytes / Math.max(1, textBytes));
  const percent = Math.max(1, Math.round(share * 100));
  const how: Record<ExcerptStrategy["kind"], string> = {
    coverage: "von jeder Seite bzw. jedem Abschnitt der Anfang",
    prefix: "von jeder Datei der Anfang, damit Aufgaben und Lösungen zueinander passen",
    relevance: "die Abschnitte, die am besten zum Thema passen",
    sample: "zufällig verteilte Abschnitte aus allen Dateien – eine neue Variante nimmt andere",
  };
  return {
    parts,
    share,
    note: `Das ausgewählte Material ist zu umfangreich für eine Anfrage an Claude (ca. ${Math.round(totalBytes / 1024)} KB Text, möglich sind ${Math.round(budget / 1024)} KB). Verwendet wurde ein Auszug von etwa ${percent} %: ${how[strategy.kind]}.`,
  };
}
