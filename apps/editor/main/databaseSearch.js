import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const SEARCH_TIMEOUT_MS = 10000;
const MAX_PENDING_SEARCHES = 16;
// 使用 Node 路径，避免 Vite 把 Node Worker 当成浏览器 Worker 重写。
const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'databaseSearchWorker.js');

/** 全文检索使用独立只读连接，避免大库查询阻塞窗口和 IPC。 */
export function createDatabaseSearch(dbPath) {
  let worker = null;
  let retiring = false;
  let closed = false;
  let nextId = 0;
  const pending = new Map();

  const rejectPending = (error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  };

  const retireWorker = (error) => {
    rejectPending(error);
    if (!worker || retiring) return;
    // 原生 SQLite 调用可能要返回后才退出；退出前不创建新线程，避免积累慢查询。
    retiring = true;
    worker.terminate().catch(() => {});
  };

  const getWorker = () => {
    if (worker) return worker;
    const current = new Worker(WORKER_PATH, {
      workerData: { dbPath },
    });
    worker = current;
    current.on('message', ({ id, results, error }) => {
      const request = pending.get(id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(id);
      if (error) request.reject(new Error(error));
      else request.resolve(results);
    });
    current.on('error', (error) => retireWorker(error));
    current.on('exit', () => {
      rejectPending(new Error('知识库检索线程已退出，请重试。'));
      worker = null;
      retiring = false;
    });
    return current;
  };

  const search = async (query) => {
    const text = String(query ?? '').trim();
    if (!text) return [];
    if (closed) throw new Error('知识库检索已关闭。');
    if (retiring || pending.size >= MAX_PENDING_SEARCHES) {
      throw new Error('知识库检索繁忙，请稍后重试。');
    }
    const current = getWorker();
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        retireWorker(new Error('知识库检索超时，请缩小关键词范围后重试。'));
      }, SEARCH_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      try {
        current.postMessage({ id, query: text });
      } catch (error) {
        retireWorker(error);
      }
    });
  };

  const close = () => {
    closed = true;
    retireWorker(new Error('知识库检索已关闭。'));
  };

  return { search, close };
}
