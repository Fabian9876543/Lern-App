import { useEffect, useRef, useState } from "react";

/** Werden gerade Dateien gezogen (und nicht nur markierter Text)? */
export function hasDraggedFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  return Array.from(dataTransfer?.types ?? []).includes("Files");
}

/**
 * Dateien, die irgendwo auf die Seite gezogen und losgelassen werden.
 * Liefert zurück, ob gerade Dateien über der Seite schweben (für einen Hinweis).
 * Gezogener Text bleibt unberührt und landet wie gewohnt im Textfeld.
 */
export function useWindowFileDrop(enabled: boolean, onDrop: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  });

  useEffect(() => {
    if (!enabled) return;
    let depth = 0;
    let timer = 0;
    const stop = () => {
      depth = 0;
      window.clearTimeout(timer);
      setDragging(false);
    };
    // Rückfall, falls ein Browser das Verlassen des Fensters nicht meldet
    const keepAlive = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(stop, 1500);
    };
    const enter = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
      keepAlive();
    };
    const over = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setDragging(true);
      keepAlive();
    };
    const leave = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) stop();
    };
    const drop = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return;
      // Sonst öffnet der Browser die Datei anstelle der App
      e.preventDefault();
      stop();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onDropRef.current(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    window.addEventListener("dragend", stop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragend", stop);
      stop();
    };
  }, [enabled]);

  return enabled && dragging;
}
