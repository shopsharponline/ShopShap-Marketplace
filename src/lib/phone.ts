export function normalizeNigerianPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  const nationalNumber = digits.startsWith('234')
    ? digits.slice(3)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;

  return /^[789]\d{9}$/.test(nationalNumber) ? `+234${nationalNumber}` : null;
}
