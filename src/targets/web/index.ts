import { downloadBlob } from "../../lib/files";
import { MODELS, getSettings, useSettings } from "../../settings";
import { dexieBackend } from "../../store/dexieBackend";
import type { AiStatus, PlatformImpl } from "../types";
import AiSettings from "./AiSettings";
import { analyzeTopics } from "./analyzeTopics";
import { describeError } from "./client";
import { generateTest } from "./generateTest";
import { gradeWithAi } from "./gradeAnswer";
import { suggestMaterialName } from "./suggestName";

function statusFor(apiKey: string): AiStatus {
  return apiKey.trim()
    ? { state: "ready" }
    : { state: "unavailable", reason: "Bitte zuerst in den Einstellungen einen API-Schlüssel eintragen." };
}

const impl: PlatformImpl = {
  backend: dexieBackend,
  generateTest,
  gradeWithAi,
  analyzeTopics,
  suggestMaterialName,
  describeError,
  aiStatus: () => statusFor(getSettings().apiKey),
  useAiStatus: () => statusFor(useSettings().apiKey),
  useGenerationModelLabel() {
    const id = useSettings().generationModel;
    return MODELS.find((m) => m.id === id)?.label ?? id;
  },
  AiSettingsSection: AiSettings,
  async saveFile(blob, fileName) {
    downloadBlob(blob, fileName);
  },
  usageNote: "Die Nutzung wird über deinen Claude-API-Schlüssel abgerechnet.",
};

export default impl;
export const backend = impl.backend;
