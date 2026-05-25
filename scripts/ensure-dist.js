/**
 * Ensures dist/index.js exists before Render start (or after install).
 * Handles Render build commands that only run "npm install" without "npm run build".
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.join(__dirname, "..");
const distEntry = path.join(rootDir, "dist", "index.js");

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: rootDir });
}

if (fs.existsSync(distEntry)) {
  process.exit(0);
}

console.log("[ensure-dist] dist/index.js missing — building...");

try {
  run("npm run build");
} catch {
  console.log("[ensure-dist] Installing devDependencies (TypeScript)...");
  run("npm install --include=dev");
  run("npm run build");
}

if (!fs.existsSync(distEntry)) {
  console.error("[ensure-dist] Build failed: dist/index.js was not created.");
  process.exit(1);
}

console.log("[ensure-dist] Build complete.");
