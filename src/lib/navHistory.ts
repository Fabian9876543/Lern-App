/**
 * Verlauf der besuchten Seiten (für den „Zurück“-Knopf). In claude.ai gibt es
 * keinen Browser-Verlauf für die App, deshalb führt die App ihn selbst.
 *
 * - Wer eine Seite aufruft, die direkt davor offen war, geht zurück statt
 *   vorwärts (kein Hin und Her zwischen zwei Seiten im Verlauf).
 * - Die Übersicht ist der Anfang: Wer sie aufruft, beginnt den Verlauf neu.
 * - Pro Seite wird die Scroll-Position gemerkt und beim Zurückgehen wiederhergestellt.
 */

export interface NavEntry {
  path: string;
  scroll: number;
}

export interface NavResult {
  entry: NavEntry;
  /** Es ging zurück zu einer schon besuchten Seite (Scroll-Position wiederherstellen). */
  restored: boolean;
}

const MAX_ENTRIES = 100;

export class NavHistory {
  private entries: NavEntry[];

  constructor(private root = "/") {
    this.entries = [{ path: root, scroll: 0 }];
  }

  get current(): NavEntry {
    return this.entries[this.entries.length - 1];
  }

  get paths(): string[] {
    return this.entries.map((e) => e.path);
  }

  get canGoBack(): boolean {
    return this.entries.length > 1;
  }

  /** Neue Seite aufrufen; `scroll` ist die Scroll-Position der Seite, die man verlässt. */
  push(path: string, scroll = 0): NavResult {
    this.current.scroll = scroll;
    const previous = this.entries[this.entries.length - 2];
    if (previous?.path === path) {
      this.entries.pop();
      return { entry: this.current, restored: true };
    }
    if (path === this.root) {
      this.entries = [{ path, scroll: 0 }];
      return { entry: this.current, restored: false };
    }
    if (this.current.path !== path) {
      this.entries.push({ path, scroll: 0 });
      if (this.entries.length > MAX_ENTRIES) this.entries.splice(1, this.entries.length - MAX_ENTRIES);
    }
    return { entry: this.current, restored: false };
  }

  /** Die aktuelle Seite durch eine andere ersetzen (z. B. nach dem Löschen oder Erstellen). */
  replace(path: string): NavResult {
    const previous = this.entries[this.entries.length - 2];
    if (previous?.path === path) {
      this.entries.pop();
      return { entry: this.current, restored: true };
    }
    if (path === this.root) {
      this.entries = [{ path, scroll: 0 }];
    } else {
      this.entries[this.entries.length - 1] = { path, scroll: 0 };
    }
    return { entry: this.current, restored: false };
  }

  /**
   * Eine Seite zurück. Seiten, für die `skip` true liefert (z. B. gelöschte
   * Tests), werden übersprungen. Gibt es keine vorherige Seite, wird die
   * aktuelle durch `fallback` ersetzt.
   */
  back(fallback: string, skip?: (path: string) => boolean): NavResult {
    for (let i = this.entries.length - 2; i >= 0; i--) {
      if (!skip?.(this.entries[i].path)) {
        this.entries.length = i + 1;
        return { entry: this.current, restored: true };
      }
    }
    this.entries = fallback === this.root ? [] : [{ path: this.root, scroll: 0 }];
    this.entries.push({ path: fallback, scroll: 0 });
    return { entry: this.current, restored: false };
  }
}
