export function getAllowedOrigins(): string[] {
  const defaults =
    "http://localhost:8080,https://socket-io-frontend-sage.vercel.app,https://socket-io-backend-z0wz.onrender.com";

  const origins = (process.env.ALLOWED_ORIGINS ?? defaults)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (process.env.RENDER_EXTERNAL_URL) {
    origins.push(process.env.RENDER_EXTERNAL_URL);
  }

  return [...new Set(origins)];
}
