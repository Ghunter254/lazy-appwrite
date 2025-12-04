export function parseCookies(
  cookieHeader: string | undefined
): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(";")
    .map((v) => {
      const idx = v.indexOf("=");
      if (idx === -1) return [v, ""];
      const key = v.slice(0, idx);
      const value = v.slice(idx + 1);
      return [key, value];
    })
    .reduce((acc, [key, value]) => {
      if (!key) return acc;
      const k = key.trim();
      let decoded = (value || "").trim();
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
        // If decoding fails, fallback to raw trimmed value.
      }
      acc[k] = decoded;
      return acc;
    }, {} as Record<string, string>);
}
