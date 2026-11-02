export type NigerianLocation = {
  /** Canonical value stored on listings/shops and shown in dropdowns. */
  name: string;
  /** Legacy / variant free-text values that must still match this location. */
  aliases: string[];
};

/**
 * The 36 states plus the Federal Capital Territory, in alphabetical order.
 * These are the only values new records may store.
 */
export const NIGERIAN_LOCATIONS: NigerianLocation[] = [
  { name: 'Abia', aliases: ['Abia State'] },
  { name: 'Abuja', aliases: ['FCT', 'FCT Abuja', 'Abuja FCT', 'Federal Capital Territory', 'Federal Capital Territory Abuja', 'Abuja F.C.T'] },
  { name: 'Adamawa', aliases: ['Adamawa State'] },
  { name: 'Akwa Ibom', aliases: ['Akwa-Ibom', 'Akwa Ibom State'] },
  { name: 'Anambra', aliases: ['Anambra State'] },
  { name: 'Bauchi', aliases: ['Bauchi State', 'Bauchi City', 'Biri'] },
  { name: 'Bayelsa', aliases: ['Bayelsa State'] },
  { name: 'Benue', aliases: ['Benue State', 'Makurdi'] },
  { name: 'Borno', aliases: ['Borno State', 'Maiduguri', 'Biu'] },
  { name: 'Cross River', aliases: ['Cross Rivers', 'Cross-River', 'Cross River State', 'Calabar'] },
  { name: 'Delta', aliases: ['Delta State', 'Asaba', 'Warri', 'Sapele'] },
  { name: 'Ebonyi', aliases: ['Ebonyi State', 'Abakaliki'] },
  { name: 'Edo', aliases: ['Edo State', 'Benin City', 'Benin', 'Auchi'] },
  { name: 'Ekiti', aliases: ['Ekiti State', 'Ado Ekiti', 'Ado-Ekiti'] },
  { name: 'Enugu', aliases: ['Enugu State', 'Enugu City', 'Nsukka'] },
  { name: 'Gombe', aliases: ['Gombe State', 'Gombe City', 'Dukku'] },
  { name: 'Imo', aliases: ['Imo State', 'Owerri'] },
  { name: 'Jigawa', aliases: ['Jigawa State', 'Dutse'] },
  { name: 'Kaduna', aliases: ['Kaduna State', 'Kaduna City', 'Zaria', 'Kafanchan'] },
  { name: 'Kano', aliases: ['Kano State', 'Kano City', 'Wudil'] },
  { name: 'Katsina', aliases: ['Katsina State', 'Katsina City', 'Daura'] },
  { name: 'Kebbi', aliases: ['Kebbi State', 'Birnin Kebbi'] },
  { name: 'Kogi', aliases: ['Kogi State', 'Lokoja', 'Okene', 'Idah'] },
  { name: 'Kwara', aliases: ['Kwara State', 'Ilorin'] },
  { name: 'Lagos', aliases: ['Lagos State', 'Lagos Island', 'Ikeja', 'Ikorodu', 'Badagry', 'Epe', 'Apapa', 'Yaba'] },
  { name: 'Nasarawa', aliases: ['Nasarawa State', 'Lafia', 'Keffi'] },
  { name: 'Niger', aliases: ['Niger State', 'Minna', 'Bida'] },
  { name: 'Ogun', aliases: ['Ogun State', 'Abeokuta', 'Sagamu', 'Ota'] },
  { name: 'Ondo', aliases: ['Ondo State', 'Akure', 'Ondo City'] },
  { name: 'Osun', aliases: ['Osun State', 'Osogbo', 'Ila Orangun'] },
  { name: 'Oyo', aliases: ['Oyo State', 'Ibadan', 'Ogbomosho', 'Oyo City', 'Saki'] },
  { name: 'Plateau', aliases: ['Plateau State', 'Jos', 'Pankshin'] },
  { name: 'Rivers', aliases: ['Rivers State', 'Port Harcourt', 'Port-Harcourt', 'P/Harcourt', 'Bonny'] },
  { name: 'Sokoto', aliases: ['Sokoto State', 'Sokoto City'] },
  { name: 'Taraba', aliases: ['Taraba State', 'Jalingo'] },
  { name: 'Yobe', aliases: ['Yobe State', 'Damaturu', 'Potiskum'] },
  { name: 'Zamfara', aliases: ['Zamfara State', 'Gusau'] },
];

/** Canonical values, for dropdown rendering. */
export const LOCATION_NAMES: string[] = NIGERIAN_LOCATIONS.map((l) => l.name);

const canonicalSet = new Set(LOCATION_NAMES.map((n) => n.toLowerCase()));

const aliasIndex = new Map<string, string>();
for (const location of NIGERIAN_LOCATIONS) {
  for (const alias of location.aliases) {
    aliasIndex.set(alias.toLowerCase(), location.name);
  }
}

function key(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Maps any free-text location onto its canonical name.
 * Returns null when the value is not a known Nigerian state/FCT.
 */
export function canonicalizeLocation(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = key(value);
  if (!normalized) return null;
  if (canonicalSet.has(normalized)) {
    return LOCATION_NAMES.find((n) => n.toLowerCase() === normalized) ?? null;
  }
  return aliasIndex.get(normalized) ?? null;
}

/**
 * Every stored spelling that should match the given location, canonical first.
 * Falls back to the raw value for unknown locations so nothing is silently dropped.
 */
export function locationSearchValues(value: string): string[] {
  const canonical = canonicalizeLocation(value);
  if (!canonical) {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  const match = NIGERIAN_LOCATIONS.find((l) => l.name === canonical);
  return match ? [match.name, ...match.aliases] : [canonical];
}

/**
 * Characters that would break out of a PostgREST `or=(...)` filter value.
 * Kept out of every value we interpolate into the filter.
 */
const UNSAFE_FILTER_CHARS = /[,()"\\.*%]/g;

function escapeFilterValue(value: string): string {
  return value.replace(UNSAFE_FILTER_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Builds a PostgREST `or` filter body matching any spelling of a location.
 * Example output: `location.ilike.*Lagos*,location.ilike.*Lagos State*`
 *
 * The canonical name and every legacy alias live in the same `or` group, so
 * existing free-text records (e.g. "Ibadan") still match the canonical
 * "Oyo" filter, while the group itself is ANDed with all other filters.
 */
export function buildLocationFilter(value: string): string | null {
  const variants = locationSearchValues(value)
    .map(escapeFilterValue)
    .filter(Boolean);

  if (variants.length === 0) return null;

  const unique = [...new Set(variants)];
  return unique.map((v) => `location.ilike.*${v}*`).join(',');
}
