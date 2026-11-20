import { useState, type ReactNode } from "react";
import { formatFolder, groupByFolder } from "../lib/folders";
import type { Material } from "../types";

export interface MaterialSelection {
  isSelected: (id: string) => boolean;
  setMany: (ids: string[], selected: boolean) => void;
}

/**
 * Materialliste, gruppiert nach Ordnern: einzelne Dateien oben, darunter jeder
 * Ordner als aufklappbare Gruppe (anfangs zugeklappt) – auf Wunsch mit Auswahl des ganzen Ordners.
 */
export default function MaterialList({
  materials,
  row,
  selection,
  folderActions,
}: {
  materials: Material[];
  /** Zeile für ein Material (ein <li>). */
  row: (m: Material) => ReactNode;
  selection?: MaterialSelection;
  /** Zusätzliche Knöpfe in der Kopfzeile eines Ordners. */
  folderActions?: (folder: string, items: Material[]) => ReactNode;
}) {
  return (
    <ul className="material-list">
      {groupByFolder(materials).map((g) =>
        g.folder === null ? (
          g.items.map(row)
        ) : (
          <FolderGroup
            key={g.folder}
            folder={g.folder}
            items={g.items}
            row={row}
            selection={selection}
            actions={folderActions?.(g.folder, g.items)}
          />
        ),
      )}
    </ul>
  );
}

function FolderGroup({
  folder,
  items,
  row,
  selection,
  actions,
}: {
  folder: string;
  items: Material[];
  row: (m: Material) => ReactNode;
  selection?: MaterialSelection;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ids = items.map((m) => m.id);
  const chosen = selection ? ids.filter(selection.isSelected).length : 0;
  const label = formatFolder(folder);
  return (
    <li className="material-folder">
      <div className="material-folder-head">
        {selection && (
          <input
            type="checkbox"
            className="material-check"
            checked={chosen === ids.length}
            ref={(el) => {
              if (el) el.indeterminate = chosen > 0 && chosen < ids.length;
            }}
            onChange={(e) => selection.setMany(ids, e.target.checked)}
            aria-label={`Alle Dateien im Ordner ${label} auswählen`}
          />
        )}
        <button type="button" className="material-folder-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span aria-hidden="true" className="material-folder-icon">
            {open ? "▾" : "▸"} 📁
          </span>
          <span className="material-folder-name">{label}</span>
          <span className="muted small">
            {items.length === 1 ? "1 Datei" : `${items.length} Dateien`}
            {selection && chosen > 0 && chosen < ids.length ? ` · ${chosen} ausgewählt` : ""}
          </span>
        </button>
        {actions}
      </div>
      {open && <ul className="material-list material-folder-items">{items.map(row)}</ul>}
    </li>
  );
}
