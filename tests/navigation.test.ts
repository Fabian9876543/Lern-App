import { describe, expect, it } from "vitest";
import { NavHistory } from "../src/lib/navHistory";
import { parentPath, routeExists } from "../src/lib/navigation";

describe("NavHistory", () => {
  it("geht zur vorherigen Seite zurück und merkt sich die Scroll-Position", () => {
    const h = new NavHistory("/");
    h.push("/subject/s1", 0);
    h.push("/plan/p1", 640);
    h.push("/test/t1", 1200);
    expect(h.paths).toEqual(["/", "/subject/s1", "/plan/p1", "/test/t1"]);
    const r = h.back("/subject/s1");
    // Zurück zum Lernplan, nicht zum Fach (übergeordnete Seite)
    expect(r.entry).toEqual({ path: "/plan/p1", scroll: 1200 });
    expect(r.restored).toBe(true);
    expect(h.back("/").entry).toEqual({ path: "/subject/s1", scroll: 640 });
    expect(h.back("/").entry.path).toBe("/");
    expect(h.canGoBack).toBe(false);
  });

  it("kein Hin und Her: die Seite direkt davor aufrufen heißt zurückgehen", () => {
    const h = new NavHistory("/");
    h.push("/subject/s1", 0);
    // Scroll-Position der Seite, die man verlässt (das Fach)
    h.push("/test/t1", 300);
    const r = h.push("/subject/s1", 0);
    expect(r.restored).toBe(true);
    expect(r.entry.scroll).toBe(300);
    expect(h.paths).toEqual(["/", "/subject/s1"]);
  });

  it("die Übersicht beginnt den Verlauf neu", () => {
    const h = new NavHistory("/");
    h.push("/subject/s1");
    h.push("/test/t1");
    h.push("/settings");
    h.push("/");
    expect(h.paths).toEqual(["/"]);
  });

  it("ersetzen: neuer Test statt Formular, gelöschter Test durch das Fach", () => {
    const h = new NavHistory("/");
    h.push("/subject/s1");
    h.push("/subject/s1/new-test");
    h.replace("/test/t1");
    expect(h.paths).toEqual(["/", "/subject/s1", "/test/t1"]);
    // Test gelöscht → zurück zum Fach, ohne es doppelt im Verlauf zu haben
    h.replace("/subject/s1");
    expect(h.paths).toEqual(["/", "/subject/s1"]);
  });

  it("Durchlauf → Ergebnis: Zurück führt zum Test", () => {
    const h = new NavHistory("/");
    h.push("/subject/s1");
    h.push("/test/t1");
    h.push("/run/a1");
    h.replace("/result/a1");
    expect(h.back("/test/t1").entry.path).toBe("/test/t1");
  });

  it("überspringt gelöschte Seiten", () => {
    const h = new NavHistory("/");
    h.push("/subject/s1");
    h.push("/test/t1");
    h.push("/result/a1");
    const r = h.back("/subject/s1", (p) => p === "/test/t1");
    expect(r.entry.path).toBe("/subject/s1");
  });

  it("ohne Verlauf geht es zur übergeordneten Seite", () => {
    const h = new NavHistory("/");
    h.replace("/test/t1");
    const r = h.back("/subject/s1");
    expect(r.entry.path).toBe("/subject/s1");
    expect(h.paths).toEqual(["/", "/subject/s1"]);
  });

  it("dieselbe Seite zweimal ergibt keinen doppelten Eintrag", () => {
    const h = new NavHistory("/");
    h.push("/subject/s1");
    h.push("/subject/s1");
    expect(h.paths).toEqual(["/", "/subject/s1"]);
  });
});

describe("parentPath / routeExists", () => {
  const data = {
    subjects: [{ id: "s1" }],
    tests: [
      { id: "t1", subjectId: "s1" },
      { id: "t2", subjectId: "s1", planId: "p1" },
    ],
    attempts: [
      { id: "a1", testId: "t1", status: "finished" },
      { id: "a2", testId: "t2", status: "in_progress" },
    ],
    plans: [{ id: "p1", subjectId: "s1" }],
    notes: [{ id: "n1", subjectId: "s1" }],
  } as unknown as Parameters<typeof parentPath>[1];

  it("kennt die übergeordnete Seite", () => {
    expect(parentPath("/subject/s1", data)).toBe("/");
    expect(parentPath("/subject/s1/new-test", data)).toBe("/subject/s1");
    expect(parentPath("/test/t1", data)).toBe("/subject/s1");
    expect(parentPath("/plan/p1?task=x", data)).toBe("/subject/s1");
    expect(parentPath("/plan/p1/note/topic", data)).toBe("/plan/p1");
    expect(parentPath("/note/n1", data)).toBe("/subject/s1");
    expect(parentPath("/run/a2", data)).toBe("/test/t2");
    expect(parentPath("/result/a1", data)).toBe("/test/t1");
    expect(parentPath("/settings", data)).toBe("/");
    expect(parentPath("/test/weg", data)).toBe("/");
  });

  it("erkennt gelöschte Seiten", () => {
    expect(routeExists("/", data)).toBe(true);
    expect(routeExists("/test/t1", data)).toBe(true);
    expect(routeExists("/test/weg", data)).toBe(false);
    expect(routeExists("/run/a1", data)).toBe(false);
    expect(routeExists("/run/a2", data)).toBe(true);
    expect(routeExists("/plan/p1?task=x", data)).toBe(true);
  });
});
