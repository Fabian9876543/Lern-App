import { TIERS, useSettings } from "../../settings";
import type { PlatformImpl } from "../types";
import AiSettings from "./AiSettings";
import { aiStatus, analyzeTopics, describeError, generateTest, gradeWithAi, useAiStatus } from "./ai";
import { artifactBackend } from "./storage";
import { useCapability } from "./claude";

const impl: PlatformImpl = {
  backend: artifactBackend,
  generateTest,
  gradeWithAi,
  analyzeTopics,
  describeError,
  aiStatus,
  useAiStatus,
  useGenerationModelLabel() {
    const tier = useSettings().generationTier;
    return `Claude (${TIERS.find((t) => t.id === tier)?.label ?? tier})`;
  },
  AiSettingsSection: AiSettings,
  async saveFile(blob, fileName) {
    const downloads = await useCapability("downloads");
    if (!downloads) throw new Error("Dateien können in dieser Ansicht nicht gespeichert werden.");
    try {
      await downloads.save({ filename: fileName, data: blob });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "declined") return;
      throw new Error(`Die Datei konnte nicht gespeichert werden (${code ?? "Fehler"}).`);
    }
  },
  usageNote: "Zählt gegen die Nutzungslimits deines Claude-Abos.",
};

export default impl;
export const backend = impl.backend;
