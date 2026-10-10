import { execFileSync, spawn } from 'node:child_process';
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
// mac 包是 universal：里面每个原生模块（.node）都必须同时带这两个架构，缺 x86_64 时 Intel Mac 打不开
const MAC_REQUIRED_ARCHS = ['x86_64', 'arm64'];

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

function readMachOArchs(file) {
  return execFileSync('lipo', ['-archs', file], { encoding: 'utf8' }).trim().split(/\s+/);
}

// 打包成功不代表 .node 是双架构的（曾经只有 arm64 也照样出 dmg），这里兜底检查，缺架构直接失败
async function assertUniversalNativeModules() {
  const entries = await fs.readdir(APP_RELEASE_DIR, { recursive: true });
  const nodeFiles = entries.filter((file) => file.includes('.app') && file.endsWith('.node'));
  if (nodeFiles.length === 0) {
    throw new Error('mac 包里没找到原生模块 .node 文件，检查打包产物');
  }
  for (const file of nodeFiles) {
    const archs = readMachOArchs(path.join(APP_RELEASE_DIR, file));
    const missing = MAC_REQUIRED_ARCHS.filter((arch) => !archs.includes(arch));
    if (missing.length > 0) {
      throw new Error(`${file} 缺少架构 ${missing.join(', ')}（现有 ${archs.join(', ')}）`);
    }
  }
  console.log(`原生模块架构检查通过：${nodeFiles.length} 个 .node 均含 ${MAC_REQUIRED_ARCHS.join(' + ')}`);
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
    // CI 上 electron-builder 默认用硬链接拷文件。universal 构建先打 x64 再 rebuild arm64，
    // arm64 的 .node 会原地覆盖 staging 里的文件，连带把 x64 临时包里硬链过去的那份也改成 arm64，
    // 最终合并时两份相同、跳过 lipo，Intel Mac 加载 better-sqlite3 失败。关掉硬链接，每个架构各拷一份。
    USE_HARD_LINKS: 'false',
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

  if (platformFlag === '--mac') {
    await assertUniversalNativeModules();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
