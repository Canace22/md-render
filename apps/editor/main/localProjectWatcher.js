import fs from 'fs';
import path from 'path';

const DEBOUNCE_MS = 400;
const WRITE_IGNORE_MS = 900;

/** @type {Map<string, { watcher: fs.FSWatcher, timer: ReturnType<typeof setTimeout> | null, notify: () => void }>} */
const watchers = new Map();

/** @type {Map<string, number>} */
const ignoreUntilByPath = new Map();
/** @type {Map<string, number>} */
const ignoreUntilByRoot = new Map();

export function markLocalProjectWriteIgnored(absolutePath, ms = WRITE_IGNORE_MS) {
  if (!absolutePath) return;
  ignoreUntilByPath.set(path.resolve(absolutePath), Date.now() + ms);
}

export function markLocalProjectRootIgnored(projectRootPath, ms = WRITE_IGNORE_MS) {
  if (!projectRootPath) return;
  const rootPath = path.resolve(projectRootPath);
  ignoreUntilByRoot.set(rootPath, Date.now() + ms);

  const entry = watchers.get(rootPath);
  if (entry?.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
}

function shouldIgnorePath(absolutePath) {
  const key = path.resolve(absolutePath);
  const until = ignoreUntilByPath.get(key);
  if (!until) return false;
  if (Date.now() < until) return true;
  ignoreUntilByPath.delete(key);
  return false;
}

function shouldIgnoreRoot(projectRootPath) {
  const key = path.resolve(projectRootPath);
  const until = ignoreUntilByRoot.get(key);
  if (!until) return false;
  if (Date.now() < until) return true;
  ignoreUntilByRoot.delete(key);
  return false;
}

function scheduleNotify(rootPath, notify) {
  const entry = watchers.get(rootPath);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    entry.timer = null;
    notify();
  }, DEBOUNCE_MS);
}

export function watchLocalProjectRoot(projectRootPath, onChanged) {
  const rootPath = path.resolve(projectRootPath);
  if (!rootPath || watchers.has(rootPath)) return;

  const notify = () => onChanged({ projectRootPath: rootPath });

  try {
    const watcher = fs.watch(rootPath, { recursive: true }, (_eventType, filename) => {
      if (shouldIgnoreRoot(rootPath)) return;
      if (filename) {
        const targetPath = path.join(rootPath, filename);
        if (shouldIgnorePath(targetPath)) return;
      }
      scheduleNotify(rootPath, notify);
    });

    watcher.on('error', (error) => {
      console.error('[local-project-watch] watcher error:', rootPath, error);
    });

    watchers.set(rootPath, { watcher, timer: null, notify });
  } catch (error) {
    console.error('[local-project-watch] failed to watch:', rootPath, error);
  }
}

export function unwatchLocalProjectRoot(projectRootPath) {
  const rootPath = path.resolve(projectRootPath);
  const entry = watchers.get(rootPath);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.watcher.close();
  watchers.delete(rootPath);
}

export function unwatchAllLocalProjects() {
  for (const rootPath of [...watchers.keys()]) {
    unwatchLocalProjectRoot(rootPath);
  }
}
