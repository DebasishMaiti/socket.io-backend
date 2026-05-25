export function getAllowedOrigins(): string[] {
  const defaults =
    "http://localhost:8080,https://socket-io-five-alpha.vercel.app,https://socket-io-qlgk.vercel.app";

  const origins = (process.env.ALLOWED_ORIGINS ?? defaults)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (process.env.RENDER_EXTERNAL_URL) {
    origins.push(process.env.RENDER_EXTERNAL_URL);
  }

  return [...new Set(origins)];
}
