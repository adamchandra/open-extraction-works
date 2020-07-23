// import path from "path";

import fs from "fs-extra";

export function writeFile(filePath: string, buffer: Buffer): boolean {
  const exists = fs.existsSync(filePath)
  const isFile = exists && fs.statSync(filePath).isFile();
  if (isFile && exists) {
    fs.removeSync(filePath)
  }
  fs.writeFileSync(filePath, buffer);
  return true;
}
