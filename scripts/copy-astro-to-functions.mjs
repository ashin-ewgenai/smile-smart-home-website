import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const astroServerDir = resolve(projectRoot, 'dist', 'server');
const functionsAstroDir = resolve(projectRoot, 'functions', 'astro');

function main() {
  if (!existsSync(astroServerDir)) {
    console.error(`[copy-astro-to-functions] Missing Astro server build at ${astroServerDir}. Run: npm run build`);
    process.exit(1);
  }

  // Clean target
  if (existsSync(functionsAstroDir)) {
    rmSync(functionsAstroDir, { recursive: true, force: true });
  }
  mkdirSync(functionsAstroDir, { recursive: true });

  // Copy entire server directory to ensure all chunks are available
  cpSync(astroServerDir, functionsAstroDir, { recursive: true });
  console.log(`[copy-astro-to-functions] Copied ${astroServerDir} -> ${functionsAstroDir}`);
}

main();
