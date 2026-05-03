const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const root = process.cwd();

function looksLikeUtf16Le(buf) {
  const n = buf.length;
  if (n < 4 || n % 2 === 1) return false;
  const pairs = Math.min(Math.floor(n / 2), 400);
  if (pairs < 4) return false;
  let highZero = 0;
  for (let i = 0; i < pairs; i++) {
    if (buf[i * 2 + 1] === 0) highZero++;
  }
  return highZero / pairs > 0.72;
}

function decodeBuffer(buf) {
  const n = buf.length;
  if (n >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le");
  }
  if (n >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const body = buf.subarray(2);
    const swapped = Buffer.allocUnsafe(body.length);
    for (let i = 0; i + 1 < body.length; i += 2) {
      swapped[i] = body[i + 1];
      swapped[i + 1] = body[i];
    }
    return swapped.toString("utf16le");
  }
  if (n >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  if (looksLikeUtf16Le(buf)) {
    return buf.toString("utf16le");
  }
  return buf.toString("utf8").split("\u0000").join("");
}

function fixFile(absPath) {
  let buf = fs.readFileSync(absPath);
  if (!buf.includes(0)) return;
  fs.writeFileSync(absPath, decodeBuffer(buf).split("\u0000").join(""), "utf8");
}

function walkFix(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walkFix(p);
    else {
      const ext = path.extname(name.name);
      if ([".mjs", ".cjs", ".js", ".ts", ".tsx", ".mts", ".cts", ".jsx"].includes(ext)) {
        fixFile(p);
      }
    }
  }
}

walkFix(path.join(root, "scripts"));
walkFix(path.join(root, "src"));
for (const n of ["vite.config.ts", "vite.config.mjs", "vite.config.js", "postcss.config.js", "tailwind.config.js"]) {
  const p = path.join(root, n);
  if (fs.existsSync(p)) fixFile(p);
}

const mode = process.env.npm_lifecycle_event || "dev";
const force = process.argv.includes("--force");
const entry = path.join(root, "scripts", "vite-entry.mjs");
const args = [entry, mode];
if (force) args.push("--force");
const r = spawnSync(process.execPath, args, { stdio: "inherit", cwd: root });
process.exit(r.status ?? 1);
