/**
 * Serialize list-filter params into a query string. `undefined` values are
 * dropped (an omitted filter, not an empty one); everything else is
 * stringified. Returns `''` or a string starting with `?`.
 */
export const buildQuery = (
  query: Record<string, string | number | boolean | undefined> | undefined
): string => {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.append(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
};
