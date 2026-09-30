import { addHours, DEMO_NOW } from "@/lib/clock";
import { OPERATORS } from "@/domain/operators";
import type { NormalizedStatus, OperatorId, TrackedShipment } from "@/domain/types";
import { CUSTOMERS, SITES } from "@/data/reference";
import { isLate } from "./eta";
import type { EtaPrediction, RiskAssessment, ShipmentQuery } from "./types";

// ponytail: keyword grammar standing in for an LLM call that returns the same ShipmentQuery JSON.
// The contract (schema + chips + unparsed words) stays the same when the parser is swapped.

type Rule<T> = [pattern: RegExp, value: T, chip: string];

const COUNTRIES: Rule<string>[] = [
  [/\b(france|french)\b/, "FR", "To France"],
  [/\b(germany|german)\b/, "DE", "To Germany"],
  [/\b(uk|united kingdom|britain|england|british)\b/, "GB", "To United Kingdom"],
  [/\b(mexico|mexican)\b/, "MX", "To Mexico"],
  [/\b(portugal|portuguese)\b/, "PT", "To Portugal"],
  [/\b(spain|spanish)\b/, "ES", "To Spain"],
  [/\b(italy|italian)\b/, "IT", "To Italy"],
];

const STATUSES: Rule<NormalizedStatus>[] = [
  [/\b(held at customs|customs hold|customs|held)\b/, "customs_hold", "Held at customs"],
  [/\bout for delivery\b/, "out_for_delivery", "Out for delivery"],
  [/\bdelivered\b/, "delivered", "Delivered"],
  [/\bin transit\b/, "in_transit", "In transit"],
  [/\b(at|in) (the )?ports?\b/, "at_port", "At port"],
  [/\b(at sea|on (a |the )?vessel)\b/, "on_vessel", "At sea"],
  [/\b(awaiting pickup|not picked up|booked)\b/, "booked", "Awaiting pickup"],
  [/\b(exceptions?|incidents?|failed)\b/, "exception", "Incident"],
];

const FLAGS: Rule<ShipmentQuery["flags"][number]>[] = [
  [/\b(running late|late|delayed|delays?|behind schedule|behind|overdue)\b/, "late", "Running late"],
  [/\b(at risk|risky|needs? attention|problems?|issues?)\b/, "at_risk", "At risk"],
  [/\b(stale|no recent updates?|no updates?|not updated)\b/, "stale", "No recent update"],
];

const MODES: Rule<"road" | "sea">[] = [
  // Runs after STATUSES, which already consumed "at sea".
  [/\b(by sea|sea freight|ocean|maritime|sea)\b/, "sea", "By sea"],
  [/\b(by road|by truck|road|truck)\b/, "road", "By road"],
];

const OPERATOR_ALIASES: Rule<OperatorId>[] = [
  [/\btransvolta\b/, "transvolta", OPERATORS.transvolta.name],
  [/\bkestrel\b/, "kestrel", OPERATORS.kestrel.name],
  [/\b(blue meridian|meridian)\b/, "bluemeridian", OPERATORS.bluemeridian.name],
  [/\balpenweg\b/, "alpenweg", OPERATORS.alpenweg.name],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (s: string) => new RegExp(`\\b${escape(s.toLowerCase())}\\b`);

const SITE_RULES: Rule<string>[] = SITES.map((s) => [word(s.name.split(" ")[0]), s.id, `From ${s.name}`]);
const CUSTOMER_RULES: Rule<string>[] = CUSTOMERS.map((c) => [word(c.name.split(" ")[0]), c.id, `Customer: ${c.name}`]);

const STOPWORDS = new Set(
  "a all an and any are at about by find for from get going how in is it list me my of on or order orders please s show shipment shipments status the there to what whats where which with".split(" "),
);

function dateWindow(text: string, now: Date): { range: { from: string; to: string }; chip: string } | undefined {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monday = addHours(day, -24 * ((day.getUTCDay() + 6) % 7));
  const windows: [RegExp, string, number, string][] = [
    [/\btoday\b/, day.toISOString(), 24, "Arriving today"],
    [/\btomorrow\b/, addHours(day, 24), 24, "Arriving tomorrow"],
    [/\bthis week\b/, monday, 24 * 7, "Arriving this week"],
    [/\bnext week\b/, addHours(monday, 24 * 7), 24 * 7, "Arriving next week"],
  ];
  const hit = windows.find(([re]) => re.test(text));
  return hit && { range: { from: hit[1], to: addHours(hit[1], hit[2]) }, chip: hit[3] };
}

export function parseQuery(text: string, now: Date = DEMO_NOW): ShipmentQuery {
  let rest = ` ${text.toLowerCase()} `;
  const interpretedAs: string[] = [];

  // Match the whole group before consuming text, so rules sharing a word (two "Arvenza" customers) all hit.
  const take = <T>(rules: Rule<T>[]): T[] => {
    const found: T[] = [];
    for (const [re, value, chip] of rules.filter(([re]) => re.test(rest))) {
      rest = rest.replace(new RegExp(re.source, "g"), " ");
      if (!found.includes(value)) found.push(value);
      if (!interpretedAs.includes(chip)) interpretedAs.push(chip);
    }
    return found;
  };

  const refMatch = /\b(?:po|shp)?-?(\d{4,})\b/.exec(rest);
  if (refMatch) {
    rest = rest.replace(refMatch[0], " ");
    interpretedAs.push(`Reference ${refMatch[1]}`);
  }

  const window = dateWindow(rest, now);
  if (window) {
    rest = rest.replace(/\b(today|tomorrow|this week|next week)\b/g, " ");
    interpretedAs.push(window.chip);
  }

  const query: ShipmentQuery = {
    text,
    ref: refMatch?.[1],
    statuses: take(STATUSES),
    flags: take(FLAGS),
    countries: take(COUNTRIES),
    mode: take(MODES)[0],
    operatorIds: take(OPERATOR_ALIASES),
    siteIds: take(SITE_RULES),
    customerIds: take(CUSTOMER_RULES),
    eta: window?.range,
    interpretedAs,
    unparsed: rest.split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOPWORDS.has(w)),
  };
  return query;
}

/** What a query is matched against: the shipment plus its derived facts. */
export type ShipmentFacts = {
  shipment: TrackedShipment;
  status: NormalizedStatus;
  stale: boolean;
  eta: EtaPrediction;
  risk: RiskAssessment;
  destinationCountry: string;
};

const anyOf = <T>(wanted: T[], actual: T | T[]) =>
  wanted.length === 0 || (Array.isArray(actual) ? actual.some((a) => wanted.includes(a)) : wanted.includes(actual));

export function matchQuery(q: ShipmentQuery, f: ShipmentFacts): boolean {
  const { shipment: s } = f;
  const flagOk = { late: isLate(f.eta), at_risk: f.risk.level !== "low", stale: f.stale };
  return (
    (!q.ref || s.orderRef.includes(q.ref) || s.reference.includes(q.ref)) &&
    anyOf(q.countries, f.destinationCountry) &&
    anyOf(q.statuses, f.status) &&
    q.flags.every((flag) => flagOk[flag]) &&
    (!q.mode || s.legs.some((l) => l.mode === q.mode)) &&
    anyOf(q.operatorIds, s.legs.map((l) => l.operatorId)) &&
    anyOf(q.siteIds, s.originSiteId) &&
    anyOf(q.customerIds, s.customerId) &&
    (!q.eta || (f.eta.expected >= q.eta.from && f.eta.expected < q.eta.to))
  );
}
