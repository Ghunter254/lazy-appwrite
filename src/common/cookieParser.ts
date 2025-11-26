export function parseCookies(
  cookieHeader: string | undefined
): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(";")
    .map((v) => v.split("="))
    .reduce((acc, [key, value]) => {
      if (!key) return acc;
      acc[key.trim()] = decodeURIComponent((value || "").trim());
      return acc;
    }, {} as Record<string, string>);
}
