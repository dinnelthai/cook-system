import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve(
  "node_modules/@pump-fun/agent-payments-sdk/dist/index.js",
);

let source;
try {
  source = await readFile(target, "utf8");
} catch (error) {
  if (error.code === "ENOENT") {
    console.log("Pump SDK interop patch: optional agent-payments package not installed");
    process.exit(0);
  }
  throw error;
}

const pattern = /import\s*\{\s*BN\s+as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*["']@coral-xyz\/anchor["'];?/g;
let replacements = 0;
source = source.replace(pattern, (_, binding) => {
  replacements += 1;
  return `import anchorCjs from "@coral-xyz/anchor"; const { BN: ${binding} } = anchorCjs;`;
});

if (replacements === 0) {
  if (source.includes('from"@coral-xyz/anchor"') || source.includes('from "@coral-xyz/anchor"')) {
    throw new Error("Pump SDK interop patch found an unknown Anchor import shape; inspect the dependency before changing it");
  }
  console.log("Pump SDK interop patch: no CommonJS BN import found");
} else {
  await writeFile(target, source, "utf8");
  console.log(`Pump SDK interop patch: fixed ${replacements} CommonJS Anchor BN import(s)`);
}
