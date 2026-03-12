import fs from "fs";
import path from "path";

const targets = [
  "package.json",
  path.join("apps", "server", "package.json"),
  path.join("apps", "web", "package.json"),
  path.join("packages", "shared", "package.json")
];

const utf8NoBom = new TextEncoder();

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
