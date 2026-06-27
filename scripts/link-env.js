// Recreate apps/*/.env.local symlinks to the root .env.local on every
// `pnpm install`. Dev-only convenience — .env.local is gitignored and never
// ships to Vercel / Trigger.dev cloud (those read from their own secret stores).

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, ".env.local");
const APPS = ["apps/web", "apps/worker"];

if (!fs.existsSync(SOURCE)) {
  console.log("[link-env] no root .env.local yet — skipping (set it up locally and re-run pnpm install)");
  process.exit(0);
}

for (const app of APPS) {
  const dst = path.join(ROOT, app, ".env.local");
  const dstDir = path.dirname(dst);
  if (!fs.existsSync(dstDir)) {
    console.log(`[link-env] ${app} not present — skipping`);
    continue;
  }
  try {
    const existing = fs.lstatSync(dst);
    if (existing.isSymbolicLink()) {
      const resolved = path.resolve(dstDir, fs.readlinkSync(dst));
      if (resolved === SOURCE) continue;
      fs.unlinkSync(dst);
    } else {
      console.log(`[link-env] ${app}/.env.local exists as a regular file — leaving it untouched`);
      continue;
    }
  } catch {
    /* missing: fall through and create */
  }
  const relTarget = path.relative(dstDir, SOURCE);
  fs.symlinkSync(relTarget, dst);
  console.log(`[link-env] linked ${app}/.env.local -> ${relTarget}`);
}
