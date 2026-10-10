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
const cliArgs = process.argv.slice(2);
const mode = cliArgs.includes('pack') ? 'pack' : 'build';
const explicitPlatform = cliArgs.find((a) => ['--mac', '--win', '--linux'].includes(a));

const isWindows = process.platform === 'win32';
// Windows 上 staging 必须和仓库同盘：pnpm 9 deploy 用 path.relative 算 modulesDir，跨盘会拼出非法路径
const STAGING_ROOT = isWindows
  ? path.join(path.dirname(workspaceRoot), '.md-render-electron-builder')
  : '/private/tmp/md-render-electron-builder';
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

// Windows 上 pnpm 是 pnpm.cmd，spawn 不开 shell 找不到；优先用 pnpm 传入的 npm_execpath（JS 入口）交给当前 node 执行
function runPnpm(args, options = {}) {
  const pnpmCli = process.env.npm_execpath;
  if (pnpmCli && /pnpm/i.test(pnpmCli) && /\.c?js$/i.test(pnpmCli)) {
    return runCommand(process.execPath, [pnpmCli, ...args], options);
  }
  return runCommand('pnpm', args, { shell: isWindows, ...options });
}

async function prepareStagingDirectory() {
  await fs.rm(STAGING_ROOT, { recursive: true, force: true });
  await fs.mkdir(STAGING_HOME, { recursive: true });

  await runPnpm([
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

// 本地 agent 用的 md-render MCP（server/mcp-bridge）：打成单文件放进 resources/mcp-bridge，
// 运行时用 Electron 自身（ELECTRON_RUN_AS_NODE=1）执行，用户机器不需要装 node。
const MCP_BRIDGE_ENTRY = path.join(workspaceRoot, 'server', 'mcp-bridge', 'index.js');
const MCP_BRIDGE_OUT_DIR = 'mcp-bridge-dist';

async function bundleMcpBridge(targetAppDir) {
  const bridgeModules = path.join(workspaceRoot, 'server', 'mcp-bridge', 'node_modules');
  await fs.access(bridgeModules).catch(() => {
    throw new Error('server/mcp-bridge 还没装依赖：先在该目录运行 npm install');
  });
  // esbuild 是 vite 的依赖，pnpm 下从 vite 所在目录解析
  const vitePkg = require.resolve('vite/package.json', { paths: [appDir] });
  const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(vitePkg)] }));
  await esbuild.build({
    entryPoints: [MCP_BRIDGE_ENTRY],
    outfile: path.join(targetAppDir, MCP_BRIDGE_OUT_DIR, 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    // 依赖里的 CommonJS 模块会用 require
    banner: { js: "import { createRequire as __mdRenderCreateRequire } from 'node:module'; const require = __mdRenderCreateRequire(import.meta.url);" },
    logLevel: 'warning',
  });
}

async function copyArtifactsBack() {
  await fs.rm(APP_RELEASE_DIR, { recursive: true, force: true });
  await fs.cp(path.join(STAGING_APP_DIR, 'release'), APP_RELEASE_DIR, {
    recursive: true,
    verbatimSymlinks: true,
  });
}

async function main() {
  await runPnpm(['exec', 'vite', 'build'], {
    cwd: appDir,
    env: {
      ...process.env,
      ELECTRON: 'true',
    },
  });

  await prepareStagingDirectory();
  await bundleMcpBridge(STAGING_APP_DIR);

  const platformFlag = explicitPlatform || (isWindows ? '--win' : '--mac');

  const builderArgs = [
    electronBuilderCli,
    '--projectDir',
    STAGING_APP_DIR,
    platformFlag,
    `-c.electronVersion=${electronVersion}`,
  ];

  if (mode === 'pack') {
    builderArgs.push('--dir');
  }

  if (!process.env.GH_TOKEN) {
    builderArgs.push('--publish', 'never');
  }

  const builderEnv = {
    ...process.env,
    npm_config_devdir: path.join(STAGING_HOME, '.electron-gyp'),
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/',
  };
  if (isWindows) {
    builderEnv.USERPROFILE = STAGING_HOME;
    builderEnv.APPDATA = path.join(STAGING_HOME, 'AppData', 'Roaming');
    builderEnv.LOCALAPPDATA = path.join(STAGING_HOME, 'AppData', 'Local');
  } else {
    builderEnv.HOME = STAGING_HOME;
  }

  await runCommand(process.execPath, builderArgs, {
    cwd: appDir,
    env: builderEnv,
  });

  await copyArtifactsBack();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
