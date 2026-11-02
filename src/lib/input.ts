export function sanitizePlainText(value: string, maxLength: number): string {
  let clean = '';
  for (const character of value.normalize('NFC')) {
    const code = character.charCodeAt(0);
    if (code <= 0x08 || (code >= 0x0b && code <= 0x1f) || code === 0x7f) continue;
    clean += character;
  }
  return clean.trim().slice(0, maxLength);
}

export function normalizeEmail(value: string): string | null {
  const email = sanitizePlainText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function sanitizeSearchTerm(value: string): string {
  return sanitizePlainText(value, 100).replace(/[%_\\",()]/g, '');
}

export function buildPostgrestOrFilter(fields: string[], input: string): string {
  const term = sanitizeSearchTerm(input);
  const quoted = `"%${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`;
  return fields.map((field) => `${field}.ilike.${quoted}`).join(',');
}
