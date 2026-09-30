import { mockAiService, type AiService } from "./service";

/** The one place to swap the mock for a real LLM/ML-backed implementation. */
export const ai: AiService = mockAiService;
