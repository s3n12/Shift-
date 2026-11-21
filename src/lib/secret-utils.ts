const PLACEHOLDER_PATTERNS = [
  /^your[_-]/i,
  /^replace[_-]/i,
  /^insert[_-]/i,
  /^paste[_-]/i,
  /^enter[_-]/i,
  /^<.*>$/,
  /^\[.*\]$/,
  /^placeholder$/i,
  /^changeme$/i,
  /^none$/i,
  /^null$/i,
  /^undefined$/i,
];

/**
 * Sanitizes an API key read from environment variables / Secrets.
 * Strips accidental whitespace, surrounding quotes, `KEY=` / `Value:` prefixes,
 * and optional `Bearer ` prefix. Returns null if empty or an obvious placeholder.
 */
export function sanitizeSecretEnv(
  raw: string | undefined,
  envName: string,
  options: { stripBearer?: boolean } = {}
): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let value = raw.trim();
  if (!value) return null;

  // Handle pasted "Name: ...\nValue: ..." or "KEY=..." strings
  const valueLineMatch = value.match(/(?:^|\n)\s*value\s*:\s*(.+)$/i);
  if (valueLineMatch?.[1]) {
    value = valueLineMatch[1].trim();
  }

  const envPrefixRegex = new RegExp(`^${envName}\\s*[:=]\\s*`, 'i');
  value = value.replace(envPrefixRegex, '').trim();

  // Strip matching single or double quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  if (options.stripBearer) {
    value = value.replace(/^bearer\s+/i, '').trim();
  }

  // Strip stray internal line breaks
  value = value.replace(/[\r\n]+/g, '').trim();

  if (!value) return null;
  if (value.toUpperCase() === envName.toUpperCase()) return null;
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) return null;

  return value;
}
