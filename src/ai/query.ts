import { DEMO_NOW, DISPLAY_TZ, startOfDay, zonedParts } from "@/lib/clock";
import { OPERATORS } from "@/domain/operators";
import type { NormalizedStatus, OperatorId, TrackedShipment } from "@/domain/types";
import { CUSTOMERS, SITES } from "@/data/reference";
import { isLate } from "./eta";
import type { EtaPrediction, RiskAssessment, ShipmentQuery } from "./types";

// NOTE(simplification): keyword grammar standing in for an LLM call that returns the same ShipmentQuery JSON.
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

// Taken before FLAGS, so "not late" is not also read as "late".
const ON_TIME: Rule<"on_time">[] = [[/\b(on time|on schedule|not late|not delayed)\b/, "on_time", "On time"]];

const FLAGS: Rule<ShipmentQuery["flags"][number]>[] = [
  [/\b(running late|late|delayed|delays?|behind schedule|behind|overdue)\b/, "late", "Running late"],
  [/\b(at risk|risky|needs? attention|problems?|issues?)\b/, "at_risk", "At risk"],
  [/\b(stale|no recent updates?|no updates?|not updated)\b/, "stale", "No recent update"],
];

const MODES: Rule<"road" | "sea">[] = [
  // Runs after STATUSES, which already consumed "at sea".
  [/\b(by sea|sea freight|ocean|maritime|sea|by (ship|vessel)|ships?|vessels?)\b/, "sea", "By sea"],
  [/\b(by road|by (truck|lorry)|roads?|trucks?|lorry|lorries)\b/, "road", "By road"],
];

const OPERATOR_ALIASES: Rule<OperatorId>[] = [
  [/\btransvoltas?\b/, "transvolta", OPERATORS.transvolta.name],
  [/\btarnwicks?\b/, "tarnwick", OPERATORS.tarnwick.name],
  [/\b(blue meridian|meridian)s?\b/, "bluemeridian", OPERATORS.bluemeridian.name],
  [/\balpenwegs?\b/, "alpenweg", OPERATORS.alpenweg.name],
];

/** True when typed is name with one letter dropped or two neighbouring letters swapped. */
function oneSlip(typed: string, name: string): boolean {
  if (typed === name || typed.length > name.length || name.length - typed.length > 1) return false;
  let i = 0;
  while (typed[i] === name[i]) i++;
  const [x, y] = [typed.slice(i), name.slice(i)];
  return x === y.slice(1) || (x[0] === y[1] && x[1] === y[0] && x.slice(2) === y.slice(2));
}

// Tolerates one typo in a country or operator name ("frnace"), and the chip names the word it came from. Only a dropped or
// swapped letter in a word of 6+ letters counts: a changed or added letter is how one real word becomes another
// ("germane", "brutish", "trench"), and shorter words are too close to each other ("franc", "unite", "spin").
const closeTo = <T>(rules: Rule<T>[], w: string) =>
  w.length >= 6 ? rules.find(([re]) => keywords(re).some((keyword) => oneSlip(w, keyword))) : undefined;

/** The one-word names of a rule: /\b(uk|united kingdom|britain)\b/ → ["uk", "britain"]. "united" alone names no country ("untied"). */
const keywords = (re: RegExp) =>
  re.source
    .replace(/\\b|s\?|[()]/g, "")
    .split("|")
    .filter((k) => /^[a-z]+$/.test(k));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (s: string) => new RegExp(`\\b${escape(s.toLowerCase())}\\b`);

const SITE_RULES: Rule<string>[] = SITES.map((s) => [word(s.name.split(" ")[0]), s.id, `From ${s.name}`]);
const CUSTOMER_RULES: Rule<string>[] = CUSTOMERS.map((c) => [word(c.name.split(" ")[0]), c.id, `Customer: ${c.name}`]);

const STOPWORDS = new Set(
  [
    "a all an and any are arrive arrives arriving at about be by due find for from get going how in is it",
    "list me my of on or order orders please s show shipment shipments status that the there to what whats where which will with",
  ]
    .join(" ")
    .split(" "),
);

// Calendar days and weeks (Monday to Monday) in the display zone, the same days the UI shows.
export function dateWindow(text: string, now: Date): { range: { from: string; to: string }; chip: string } | undefined {
  const { y, m, d } = zonedParts(now, DISPLAY_TZ);
  const monday = -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7); // days back to this week's Monday
  const windows: [RegExp, number, number, string][] = [
    [/\btoday\b/, 0, 1, "Arriving today"],
    [/\btomorrow\b/, 1, 2, "Arriving tomorrow"],
    [/\bthis week\b/, monday, monday + 7, "Arriving this week"],
    [/\bnext week\b/, monday + 7, monday + 14, "Arriving next week"],
  ];
  const hit = windows.find(([re]) => re.test(text));
  return hit && { range: { from: startOfDay(now, hit[1]), to: startOfDay(now, hit[2]) }, chip: hit[3] };
}

export function parseQuery(text: string, now: Date = DEMO_NOW): ShipmentQuery {
  let rest = ` ${text.toLowerCase()} `;
  const interpretedAs: string[] = [];

  // Match the whole group before consuming text, so rules sharing a word (two "Oskendra" customers) all hit.
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

  const statuses = take(STATUSES);
  const flags = [...take(ON_TIME), ...take(FLAGS)];
  const countries = take(COUNTRIES);
  const mode = take(MODES)[0];
  const operatorIds = take(OPERATOR_ALIASES);
  const siteIds = take(SITE_RULES);
  const customerIds = take(CUSTOMER_RULES);

  // A near-miss is used, but the chip says which word it came from, so nothing is guessed silently.
  const unparsed = rest.split(/[^\p{L}\p{N}]+/u).filter((w) => {
    if (!w || STOPWORDS.has(w)) return false;
    const country = closeTo(COUNTRIES, w);
    const operator = country ? undefined : closeTo(OPERATOR_ALIASES, w);
    const hit = country ?? operator;
    if (!hit) return true;
    if (country && !countries.includes(country[1])) countries.push(country[1]);
    if (operator && !operatorIds.includes(operator[1])) operatorIds.push(operator[1]);
    interpretedAs.push(`${hit[2]} (from '${w}')`);
    return false;
  });

  return { text, ref: refMatch?.[1], statuses, flags, countries, mode, operatorIds, siteIds, customerIds, eta: window?.range, interpretedAs, unparsed };
}

/** Only unknown words: matching everything would pretend to answer, so the query matches nothing instead. */
export const understoodNothing = (q: ShipmentQuery) => q.interpretedAs.length === 0 && q.unparsed.length > 0;

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
  const late = isLate(f.eta);
  // "On time" needs evidence: still open, not late, and not stale (stale data can't confirm it).
  const flagOk = { late, at_risk: f.risk.level !== "low", stale: f.stale, on_time: f.status !== "delivered" && !late && !f.stale };
  return (
    !understoodNothing(q) &&
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
