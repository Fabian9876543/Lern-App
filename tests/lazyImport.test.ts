import { describe, expect, it } from "vitest";
import { ModuleLoadError, failedModuleUrl, isModuleLoadError, loadModule, retryUrl } from "../src/lib/lazyImport";

const CHROME = "Failed to fetch dynamically imported module: https://abc.frame.claudeusercontent.com/_f/1795465313-5545/assets/pdf-YwugTw7Y.js";
const FIREFOX = "error loading dynamically imported module: https://example.org/assets/pdf-YwugTw7Y.js";
const SAFARI = "Importing a module script failed.";

describe("Programmteile nachladen", () => {
  it("erkennt Ladefehler aller Browser", () => {
    expect(isModuleLoadError(new TypeError(CHROME))).toBe(true);
    expect(isModuleLoadError(new TypeError(FIREFOX))).toBe(true);
    expect(isModuleLoadError(new TypeError(SAFARI))).toBe(true);
    expect(isModuleLoadError(new Error("Unable to preload CSS for /assets/x.css"))).toBe(true);
  });

  it("andere Fehler sind keine Ladefehler", () => {
    expect(isModuleLoadError(new Error("Invalid PDF structure"))).toBe(false);
    expect(isModuleLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isModuleLoadError("kaputt")).toBe(false);
  });

  it("liest die Adresse aus der Fehlermeldung", () => {
    expect(failedModuleUrl(new TypeError(CHROME))).toBe("https://abc.frame.claudeusercontent.com/_f/1795465313-5545/assets/pdf-YwugTw7Y.js");
    expect(failedModuleUrl(new TypeError(FIREFOX))).toBe("https://example.org/assets/pdf-YwugTw7Y.js");
    expect(failedModuleUrl(new TypeError(`${CHROME}?retry=abc1`))).toBe(
      "https://abc.frame.claudeusercontent.com/_f/1795465313-5545/assets/pdf-YwugTw7Y.js",
    );
    expect(failedModuleUrl(new TypeError(SAFARI))).toBeNull();
  });

  it("neue Adresse für den nächsten Versuch", () => {
    expect(retryUrl("https://x/a.js", 1)).toMatch(/^https:\/\/x\/a\.js\?retry=\w+1$/);
    expect(retryUrl("https://x/a.js?v=2", 2)).toMatch(/^https:\/\/x\/a\.js\?v=2&retry=\w+2$/);
  });

  it("klappt es gleich, wird nur einmal geladen", async () => {
    let calls = 0;
    expect(await loadModule(async () => (calls++, "ok"), "Teil", [0, 0])).toBe("ok");
    expect(calls).toBe(1);
  });

  it("wiederholt nach einem Verbindungsfehler", async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      if (calls === 1) throw new TypeError(SAFARI);
      return "ok";
    };
    expect(await loadModule(load, "Teil", [0, 0])).toBe("ok");
    expect(calls).toBe(2);
  });

  it("gibt nach drei Versuchen mit verständlicher Meldung auf", async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      throw new TypeError(SAFARI);
    };
    const error = await loadModule(load, "Der PDF-Leser", [0, 0]).catch((e) => e);
    expect(calls).toBe(3);
    expect(error).toBeInstanceOf(ModuleLoadError);
    expect(error.message).toMatch(/^Der PDF-Leser konnte nicht geladen werden/);
    expect(error.message).toMatch(/Seite neu/);
    expect(error.message).not.toMatch(/dynamically|module/i);
  });

  it("Fehler im Programmteil selbst werden nicht wiederholt", async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      throw new Error("Invalid PDF structure");
    };
    await expect(loadModule(load, "Teil", [0, 0])).rejects.toThrow("Invalid PDF structure");
    expect(calls).toBe(1);
  });
});
