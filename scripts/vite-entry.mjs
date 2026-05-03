import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(__dirname, "run-vite.mjs");

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

let buf = fs.readFileSync(runner);
if (buf.includes(0)) {
  fs.writeFileSync(runner, decodeBuffer(buf).split("\u0000").join(""), "utf8");
}

const r = spawnSync(process.execPath, [runner, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
