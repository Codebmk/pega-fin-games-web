import fs from "fs";
import path from "path";

const targets = [
  "package.json",
  path.join("apps", "server", "package.json"),
  path.join("apps", "web", "package.json"),
  path.join("packages", "shared", "package.json")
];

function stripBom(filePath) {
  if (!fs.existsSync(filePath)) return;
  const data = fs.readFileSync(filePath);
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    const sliced = data.slice(3);
    fs.writeFileSync(filePath, sliced);
  }
}

for (const rel of targets) {
  const full = path.resolve(process.cwd(), rel);
  stripBom(full);
}

function stripBomInDir(dirPath, ext) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    const full = path.join(dirPath, entry);
    if (fs.statSync(full).isFile() && full.endsWith(ext)) {
      stripBom(full);
    }
  }
}

stripBomInDir(path.resolve(process.cwd(), "db", "migrations"), ".sql");
stripBomInDir(path.resolve(process.cwd(), "supabase", "migrations"), ".sql");
