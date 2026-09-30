import { z } from "zod";
import { NORMALIZED_STATUSES } from "@/domain/types";

// AI outputs are a trust boundary: whatever produces them (mock today, LLM/ML tomorrow)
// must pass these schemas before reaching the UI.

const isoDate = z.iso.datetime();

export const RiskFlagSchema = z.enum(["customs_hold", "port_delay", "stale", "late", "exception", "missing_document", "unrecognised_update"]);

export const RiskAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  level: z.enum(["low", "medium", "high"]),
  flags: z.array(RiskFlagSchema),
  reasons: z.array(z.string()),
});

export const EtaPredictionSchema = z.object({
  expected: isoDate,
  earliest: isoDate,
  latest: isoDate,
  reliability: z.enum(["confirmed", "estimated"]),
  confidence: z.enum(["high", "medium", "low"]),
  delayHours: z.number().int(), // vs promised delivery; negative = early
  explanation: z.string(),
});

export const NextActionSchema = z.object({
  kind: z.enum(["notify_customer", "contact_operator", "upload_document", "none"]),
  label: z.string(),
  rationale: z.string(),
});

export const DailySummarySchema = z.object({
  headline: z.string(),
  counts: z.object({
    atRisk: z.number().int(),
    customsHold: z.number().int(),
    portDelay: z.number().int(),
    stale: z.number().int(),
    exceptions: z.number().int(),
    outForDelivery: z.number().int(),
    deliveredToday: z.number().int(),
  }),
  items: z.array(z.object({ shipmentId: z.string(), score: z.number().int(), action: NextActionSchema })),
});

export const ShipmentQuerySchema = z.object({
  text: z.string(),
  ref: z.string().optional(), // digits matched against order and shipment references
  countries: z.array(z.string().length(2)),
  statuses: z.array(z.enum(NORMALIZED_STATUSES)),
  flags: z.array(z.enum(["late", "at_risk", "stale", "on_time"])),
  mode: z.enum(["road", "sea"]).optional(),
  operatorIds: z.array(z.enum(["transvolta", "kestrel", "bluemeridian", "alpenweg"])),
  siteIds: z.array(z.string()),
  customerIds: z.array(z.string()),
  eta: z.object({ from: isoDate, to: isoDate }).optional(),
  interpretedAs: z.array(z.string()), // shown to the user as chips so they can see what we understood
  unparsed: z.array(z.string()),
});

export const CustomerNoticeSchema = z.object({
  title: z.string(),
  body: z.string(),
  severity: z.enum(["info", "warning"]),
});

export const QueryAnswerSchema = z.object({
  text: z.string(),
  shipmentId: z.string().optional(), // set when the answer is about one shipment, to link to it
});

/** A proposed reading of an operator code we could not map. Shown as a suggestion, never applied to the status. */
export const MappingSuggestionSchema = z.object({
  status: z.enum(NORMALIZED_STATUSES).exclude(["unknown"]),
  meaning: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

export type RiskFlag = z.infer<typeof RiskFlagSchema>;
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;
export type EtaPrediction = z.infer<typeof EtaPredictionSchema>;
export type NextAction = z.infer<typeof NextActionSchema>;
export type DailySummary = z.infer<typeof DailySummarySchema>;
export type ShipmentQuery = z.infer<typeof ShipmentQuerySchema>;
export type CustomerNotice = z.infer<typeof CustomerNoticeSchema>;
export type QueryAnswer = z.infer<typeof QueryAnswerSchema>;
export type MappingSuggestion = z.infer<typeof MappingSuggestionSchema>;
