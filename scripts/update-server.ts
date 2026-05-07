/**
 * Local Tauri updater test harness.
 *
 * Builds the app at a bumped version and serves the produced NSIS installer
 * + a signed `latest.json` manifest on http://localhost:8787, which is the
 * endpoint hardcoded into tauri.conf.json's updater plugin.
 *
 * Tauri 2.10+ writes the installer as `<name>-setup.exe` with a sibling
 * `<name>-setup.exe.sig`; the updater plugin downloads and runs the .exe
 * directly (no .nsis.zip wrapping).
 *
 * Usage:
 *   pnpm update:local                -> auto-bump patch
 *   pnpm update:local -- --version 1.2.3
 */

import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC_TAURI = join(ROOT, 'src-tauri');
const TAURI_CONF = join(SRC_TAURI, 'tauri.conf.json');
const NSIS_BUNDLE_DIR = join(SRC_TAURI, 'target', 'release', 'bundle', 'nsis');
const PRIVATE_KEY_FILE = join(SRC_TAURI, '.tauri', 'updater-private.key');
const PRIVATE_KEY_PASSWORD_FILE = join(SRC_TAURI, '.tauri', 'updater-password');
const TAURI_CLI = join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const PORT = 8787;

/**
 * Build the env passed to `tauri build`. Reads the private key + password
 * from src-tauri/.tauri/ and sets the env vars Tauri expects. Both files
 * are gitignored along with the rest of src-tauri/.tauri/.
 */
function buildSubprocessEnv(): NodeJS.ProcessEnv {
  if (!existsSync(PRIVATE_KEY_FILE)) {
    throw new Error(
      `Updater private key not found at ${PRIVATE_KEY_FILE}. Generate one with:\n` +
        `  pnpm tauri signer generate -w src-tauri/.tauri/updater-private.key -p "<password>" --ci -f`,
    );
  }
  if (!existsSync(PRIVATE_KEY_PASSWORD_FILE)) {
    throw new Error(
      `Updater key password not found at ${PRIVATE_KEY_PASSWORD_FILE}. Write the key's password into that file.`,
    );
  }
  return {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(PRIVATE_KEY_FILE, 'utf8'),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: readFileSync(PRIVATE_KEY_PASSWORD_FILE, 'utf8').trim(),
  };
}

function parseArgs(argv: string[]): { version?: string } {
  const out: { version?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--version' && argv[i + 1]) {
      out.version = argv[i + 1];
      i++;
    }
  }
  return out;
}

function bumpPatch(version: string): string {
  const parts = version.split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Cannot auto-bump non-semver version "${version}"`);
  }
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

async function findArtifact(dir: string, suffix: string): Promise<string> {
  const entries = await readdir(dir);
  const matches = entries.filter((f) => f.endsWith(suffix));
  if (matches.length === 0) {
    throw new Error(`No file ending in "${suffix}" found in ${dir}`);
  }
  matches.sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);
  return join(dir, matches[0]);
}

function runTauriBuild(version: string): Promise<void> {
  return new Promise((res, rej) => {
    // Override version, and turn on updater-artifact signing only for this
    // build (the committed config has it off, so plain `pnpm tauri build`
    // produces an unsigned baseline installer with no env requirement).
    const config = JSON.stringify({
      version,
      bundle: { createUpdaterArtifacts: true },
    });
    // Invoke the Tauri CLI's JS entry directly via node. Going through
    // `pnpm tauri ...` trips Node 20+'s Windows-spawn block on `.cmd` files
    // (CVE-2024-27980). Using node + the CLI script avoids the issue and
    // passes the JSON config arg through verbatim.
    const args = [TAURI_CLI, 'build', '--config', config];
    console.log(`> node ${args.join(' ')}`);
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: buildSubprocessEnv(),
    });
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`tauri build exited ${code}`))));
    child.on('error', rej);
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const tauriConf = JSON.parse(readFileSync(TAURI_CONF, 'utf8')) as { version: string };
  const newVersion = args.version ?? bumpPatch(tauriConf.version);
  console.log(`Building YANK v${newVersion} (current source version: ${tauriConf.version})`);

  await runTauriBuild(newVersion);

  const exePath = await findArtifact(NSIS_BUNDLE_DIR, '-setup.exe');
  const sigPath = `${exePath}.sig`;
  if (!existsSync(sigPath)) {
    throw new Error(`Signature file not found next to installer: ${sigPath}`);
  }
  const signature = (await readFile(sigPath, 'utf8')).trim();
  const exeName = exePath.split(/[\\/]/).pop()!;

  const manifest = {
    version: newVersion,
    notes: `Local test build v${newVersion}`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature,
        url: `http://localhost:${PORT}/${encodeURIComponent(exeName)}`,
      },
    },
  };

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/latest.json') {
      const body = JSON.stringify(manifest, null, 2);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }
    const requested = decodeURIComponent(url.replace(/^\//, ''));
    if (requested === exeName) {
      const size = statSync(exePath).size;
      res.writeHead(200, {
        'Content-Type': 'application/vnd.microsoft.portable-executable',
        'Content-Length': size,
      });
      createReadStream(exePath).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  server.listen(PORT, () => {
    console.log('');
    console.log(`Update server ready at http://localhost:${PORT}`);
    console.log(`  Manifest:  http://localhost:${PORT}/latest.json`);
    console.log(`  Installer: http://localhost:${PORT}/${encodeURIComponent(exeName)}`);
    console.log(`  Version:   ${newVersion}`);
    console.log('');
    console.log('Trigger an update from a running YANK instance, or Ctrl+C to stop.');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
