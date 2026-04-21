import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

// Top-level guard: exit cleanly if anything goes wrong at all
process.on("uncaughtException", () => process.exit(0));
process.on("unhandledRejection", () => process.exit(0));

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = dirname(__dirname);
const projectRoot = dirname(serverRoot);

async function main() {
  try {
    console.log("Starting chromium postinstall script...");

    // Skip if archive already exists (avoids failure when postinstall runs twice during Docker build)
    const earlyOutputPath = join(projectRoot, "client", "public", "chromium-pack.tar");
    if (existsSync(earlyOutputPath)) {
      console.log("✅ Chromium archive already exists, skipping.");
      return;
    }

    let chromiumResolvedPath;
    try {
      chromiumResolvedPath = import.meta.resolve("@sparticuz/chromium");
    } catch {
      console.log("@sparticuz/chromium not installed (devDependency), skipping");
      return;
    }
    const chromiumPath = chromiumResolvedPath.replace(/^file:\/\//, "");
    const chromiumDir = dirname(dirname(dirname(chromiumPath)));
    const binDir = join(chromiumDir, "bin");

    if (!existsSync(binDir)) {
      console.log("⚠️ Chromium bin directory not found, skipping archive creation");
      return;
    }

    const publicDir = join(projectRoot, "client", "public");
    const outputPath = join(publicDir, "chromium-pack.tar");

    console.log("📦 Creating chromium tar archive...");
    console.log("  Source:", binDir);
    console.log("  Output:", outputPath);

    execSync(`mkdir -p "${publicDir}" && tar -cf "${outputPath}" -C "${binDir}" .`, {
      stdio: "inherit",
      cwd: serverRoot,
    });

    console.log("✅ Chromium archive created successfully!");
  } catch (error) {
    console.error("❌ Failed to create chromium archive:", error.message);
    console.log("⚠️ This is not critical for local development");
    process.exit(0);
  }
}

main();
