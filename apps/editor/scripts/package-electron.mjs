import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(appDir, '..', '..');
const mode = process.argv[2] === 'pack' ? 'pack' : 'build';

const STAGING_ROOT = '/private/tmp/md-render-electron-builder';
const STAGING_APP_DIR = path.join(STAGING_ROOT, 'app');
const STAGING_HOME = path.join(STAGING_ROOT, 'home');
const APP_RELEASE_DIR = path.join(appDir, 'release');

const electronBuilderCli = require.resolve('electron-builder/out/cli/cli.js', {
  paths: [appDir],
});
const electronVersion = require(require.resolve('electron/package.json', {
  paths: [appDir],
})).version;

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function prepareStagingDirectory() {
  await fs.rm(STAGING_ROOT, { recursive: true, force: true });
  await fs.mkdir(STAGING_HOME, { recursive: true });

  await runCommand('pnpm', [
    '--dir',
    workspaceRoot,
    '--filter',
    '@md-render/editor',
    'deploy',
    '--prod',
    STAGING_APP_DIR,
  ]);

  await fs.rm(path.join(STAGING_APP_DIR, 'release'), { recursive: true, force: true });
}

async function copyArtifactsBack() {
  await fs.rm(APP_RELEASE_DIR, { recursive: true, force: true });
  await fs.cp(path.join(STAGING_APP_DIR, 'release'), APP_RELEASE_DIR, {
    recursive: true,
  });
}

async function main() {
  await runCommand('pnpm', ['exec', 'vite', 'build'], {
    cwd: appDir,
    env: {
      ...process.env,
      ELECTRON: 'true',
    },
  });

  await prepareStagingDirectory();

  const builderArgs = [
    electronBuilderCli,
    '--projectDir',
    STAGING_APP_DIR,
    '--mac',
    `-c.electronVersion=${electronVersion}`,
  ];

  if (mode === 'pack') {
    builderArgs.push('--dir');
  }

  await runCommand(process.execPath, builderArgs, {
    cwd: appDir,
    env: {
      ...process.env,
      HOME: STAGING_HOME,
      npm_config_devdir: path.join(STAGING_HOME, '.electron-gyp'),
    },
  });

  await copyArtifactsBack();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
