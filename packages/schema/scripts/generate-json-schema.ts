import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildJsonSchemas } from '../src/json-schema';

const outDir = fileURLToPath(new URL('../generated/', import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(buildJsonSchemas())) {
  const file = `${outDir}${name}.schema.json`;
  writeFileSync(file, `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`✓ ${name}.schema.json`);
}
