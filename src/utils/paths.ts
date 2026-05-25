import path from "path";

/** Writable upload directory (ephemeral on Render/Vercel; persistent locally). */
export function getUploadBaseDir(): string {
  if (process.env.UPLOAD_DIR) {
    return process.env.UPLOAD_DIR;
  }
  if (process.env.VERCEL || process.env.RENDER) {
    return "/tmp/uploads";
  }
  return path.join(process.cwd(), "public", "uploads");
}
