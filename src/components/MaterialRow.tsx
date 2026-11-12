import type { ReactNode } from "react";
import { ROLE_LABELS, formatBytes } from "../lib/files";
import { useNamingIds } from "../lib/materialNaming";
import { repo } from "../store/store";
import type { Material, MaterialRole } from "../types";
import { confirmDialog, promptDialog } from "./Dialogs";

const KIND_ICON = { pdf: "📄", image: "🖼️", text: "📝" } as const;

/** Eine Zeile in einer Materialliste: Ansehen, Rolle, Umbenennen, Löschen – optional mit Auswahlkästchen. */
export default function MaterialRow({
  material: m,
  onPreview,
  selectable,
  extra,
  actions = true,
}: {
  material: Material;
  onPreview?: (m: Material) => void;
  selectable?: { checked: boolean; onToggle: () => void };
  extra?: ReactNode;
  actions?: boolean;
}) {
  const naming = useNamingIds().has(m.id);

  async function rename() {
    const name = await promptDialog("Material umbenennen", { label: "Name", initial: m.name });
    if (name) repo.updateMaterial(m.id, { name });
  }

  async function remove() {
    const ok = await confirmDialog(`„${m.name}“ löschen?`, { title: "Material löschen", confirmLabel: "Löschen", danger: true });
    if (ok) repo.deleteMaterial(m.id);
  }

  return (
    <li className="material-item">
      {selectable && (
        <input
          type="checkbox"
          className="material-check"
          checked={selectable.checked}
          onChange={selectable.onToggle}
          aria-label={`${m.name} für diesen Test verwenden`}
        />
      )}
      <span className="material-icon">{KIND_ICON[m.kind]}</span>
      <div className="material-name">
        {onPreview ? (
          <button className="link-btn" onClick={() => onPreview(m)} title={m.originalName ? `Ursprünglich: ${m.originalName}` : "Ansehen"}>
            {m.name}
          </button>
        ) : (
          <span title={m.originalName ? `Ursprünglich: ${m.originalName}` : undefined}>{m.name}</span>
        )}
        <span className="muted small">
          {naming ? " · wird benannt …" : ` · ${formatBytes(m.size)}`}
          {extra}
        </span>
      </div>
      <select
        className={`select select-sm role-${m.role}`}
        value={m.role}
        aria-label={`Rolle von ${m.name}`}
        onChange={(e) => repo.updateMaterial(m.id, { role: e.target.value as MaterialRole })}
      >
        {Object.entries(ROLE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {actions && (
        <>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label={`${m.name} umbenennen`} onClick={rename}>
            ✏️
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label={`${m.name} löschen`} onClick={remove}>
            🗑
          </button>
        </>
      )}
    </li>
  );
}
