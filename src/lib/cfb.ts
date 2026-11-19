/**
 * Liest „Compound File Binary“-Container – das Format der alten Office-Dateien
 * (.xls, .doc bis Office 2003). Ein Container ist ein kleines Dateisystem in
 * der Datei; gebraucht werden nur die Datenströme direkt unter der Wurzel,
 * z. B. „Workbook“ (Excel) oder „WordDocument“ und „1Table“ (Word).
 */

export class CfbError extends Error {}

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const END_OF_CHAIN = 0xfffffffe;
const FREE = 0xffffffff;
const NO_STREAM = 0xffffffff;

export function isCfb(data: Uint8Array): boolean {
  return data.length >= 512 && SIGNATURE.every((b, i) => data[i] === b);
}

interface DirEntry {
  name: string;
  type: number;
  left: number;
  right: number;
  child: number;
  start: number;
  size: number;
}

/** Liefert die angefragten Datenströme direkt unter der Wurzel (Namen ohne Groß-/Kleinschreibung). */
export function readCfbStreams(data: Uint8Array, names: string[]): Map<string, Uint8Array> {
  if (!isCfb(data)) throw new CfbError("Kein Office-Container.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u32 = (pos: number) => (pos + 4 <= data.length ? view.getUint32(pos, true) : END_OF_CHAIN);
  const u16 = (pos: number) => view.getUint16(pos, true);

  const sectorShift = u16(0x1e);
  const miniShift = u16(0x20);
  if (sectorShift !== 9 && sectorShift !== 12) throw new CfbError("Unbekannte Sektorgröße.");
  const sectorSize = 1 << sectorShift;
  const miniSize = 1 << miniShift;
  const sectorCount = Math.floor((data.length - sectorSize) / sectorSize) + 1;
  const offsetOf = (sector: number) => (sector + 1) * sectorSize;

  // FAT-Sektoren: die ersten 109 im Kopf, weitere in der DIFAT-Kette.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = u32(0x4c + i * 4);
    if (s !== FREE) fatSectors.push(s);
  }
  let difat = u32(0x44);
  const perDifat = sectorSize / 4 - 1;
  for (let guard = 0; difat !== END_OF_CHAIN && difat !== FREE && guard < sectorCount; guard++) {
    const base = offsetOf(difat);
    for (let i = 0; i < perDifat; i++) {
      const s = u32(base + i * 4);
      if (s !== FREE) fatSectors.push(s);
    }
    difat = u32(base + perDifat * 4);
  }
  const perSector = sectorSize / 4;
  const fat = new Uint32Array(fatSectors.length * perSector);
  fatSectors.forEach((sector, i) => {
    const base = offsetOf(sector);
    for (let j = 0; j < perSector; j++) fat[i * perSector + j] = u32(base + j * 4);
  });

  /** Folgt einer Sektorkette; schützt vor Schleifen in beschädigten Dateien. */
  function chain(start: number, table: Uint32Array, limit: number): number[] {
    const out: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s !== END_OF_CHAIN && s !== FREE; s = table[s] ?? END_OF_CHAIN) {
      if (seen.has(s) || s >= limit) throw new CfbError("Die Datei ist beschädigt.");
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  function readRegular(start: number, size: number): Uint8Array {
    const out = new Uint8Array(size);
    let written = 0;
    for (const s of chain(start, fat, sectorCount)) {
      if (written >= size) break;
      const begin = offsetOf(s);
      const part = data.subarray(begin, Math.min(begin + sectorSize, data.length, begin + size - written));
      out.set(part, written);
      written += part.length;
    }
    return out;
  }

  // Verzeichnis
  const dirBytes = (() => {
    const sectors = chain(u32(0x30), fat, sectorCount);
    const out = new Uint8Array(sectors.length * sectorSize);
    sectors.forEach((s, i) => out.set(data.subarray(offsetOf(s), offsetOf(s) + sectorSize), i * sectorSize));
    return out;
  })();
  const dv = new DataView(dirBytes.buffer);
  const entries: DirEntry[] = [];
  for (let pos = 0; pos + 128 <= dirBytes.length; pos += 128) {
    const nameLen = Math.max(0, Math.min(64, dv.getUint16(pos + 0x40, true)) - 2);
    let name = "";
    for (let i = 0; i < nameLen; i += 2) name += String.fromCharCode(dv.getUint16(pos + i, true));
    entries.push({
      name,
      type: dirBytes[pos + 0x42],
      left: dv.getUint32(pos + 0x44, true),
      right: dv.getUint32(pos + 0x48, true),
      child: dv.getUint32(pos + 0x4c, true),
      start: dv.getUint32(pos + 0x74, true),
      size: dv.getUint32(pos + 0x78, true),
    });
  }
  const root = entries[0];
  if (!root || root.type !== 5) throw new CfbError("Die Datei ist beschädigt.");

  // Kleine Ströme liegen im „Mini-Stream“ des Wurzeleintrags.
  const cutoff = u32(0x38) || 4096;
  let miniStream: Uint8Array | null = null;
  let miniFat: Uint32Array | null = null;
  function readMini(start: number, size: number): Uint8Array {
    miniStream ??= readRegular(root.start, root.size);
    if (!miniFat) {
      const sectors = chain(u32(0x3c), fat, sectorCount);
      miniFat = new Uint32Array(sectors.length * perSector);
      sectors.forEach((s, i) => {
        for (let j = 0; j < perSector; j++) miniFat![i * perSector + j] = u32(offsetOf(s) + j * 4);
      });
    }
    const out = new Uint8Array(size);
    let written = 0;
    for (const s of chain(start, miniFat, Math.ceil(miniStream.length / miniSize))) {
      if (written >= size) break;
      const part = miniStream.subarray(s * miniSize, Math.min((s + 1) * miniSize, s * miniSize + size - written));
      out.set(part, written);
      written += part.length;
    }
    return out;
  }

  // Direkte Kinder der Wurzel (Rot-Schwarz-Baum über left/right).
  const wanted = new Map(names.map((n) => [n.toLowerCase(), n]));
  const result = new Map<string, Uint8Array>();
  const stack = [root.child];
  const visited = new Set<number>();
  while (stack.length) {
    const i = stack.pop()!;
    if (i === NO_STREAM || i >= entries.length || visited.has(i)) continue;
    visited.add(i);
    const e = entries[i];
    stack.push(e.left, e.right);
    const key = wanted.get(e.name.toLowerCase());
    if (e.type !== 2 || !key) continue;
    result.set(key, e.size < cutoff ? readMini(e.start, e.size) : readRegular(e.start, e.size));
  }
  return result;
}
