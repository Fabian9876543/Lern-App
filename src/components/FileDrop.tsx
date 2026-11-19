import { useRef, useState, type ReactNode } from "react";
import { pickedFromDrop, pickedFromInput, type PickedFile } from "../lib/folders";

/** Fläche zum Hineinziehen oder Antippen – nimmt Dateien und ganze Ordner (mit Unterordnern) an. */
export default function FileDrop({
  accept,
  multiple = true,
  onFiles,
  children,
  label,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: PickedFile[]) => void;
  children: ReactNode;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`filedrop ${dragging ? "dragging" : ""}`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label={label}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        // Die Einträge müssen noch während des Ereignisses abgeholt werden.
        void pickedFromDrop(e.dataTransfer).then((items) => items.length && onFiles(items));
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        data-testid="file-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(pickedFromInput(files));
        }}
      />
      {children}
    </div>
  );
}
