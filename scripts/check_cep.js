const fs = require("fs");
const path = require("path");

const repo_root = path.join(__dirname, "..");
const required_paths = [
  "CSXS/manifest.xml",
  "cep/index.html",
  "cep/main.js",
  "cep/styles.css",
  "lib/mixbox.js",
  "debug/cep_dev_setup.ps1",
  "doc/DEVELOPMENT_GUIDE.md",
];

let ok = true;
for (const rel of required_paths) {
  const abs = path.join(repo_root, rel);
  if (!fs.existsSync(abs)) {
    ok = false;
    console.error(`[check_cep] missing: ${rel}`);
  }
}

if (!ok) process.exit(1);
console.log("OK");

