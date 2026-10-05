import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';

const DB_BUSY_TIMEOUT_MS = 1000;
const SEARCH_RESULT_LIMIT = 50;
const SEARCH_SNIPPET_TOKENS = 32;

const db = new Database(workerData.dbPath, {
  readonly: true,
  fileMustExist: true,
  timeout: DB_BUSY_TIMEOUT_MS,
});
const statement = db.prepare(`
  SELECT d.id, d.name, d.type,
         snippet(documents_fts, 1, '<mark>', '</mark>', '...', ${SEARCH_SNIPPET_TOKENS}) AS excerpt
  FROM documents_fts fts
  JOIN documents d ON d.rowid = fts.rowid
  WHERE documents_fts MATCH ?
  ORDER BY rank
  LIMIT ${SEARCH_RESULT_LIMIT}
`);

parentPort.on('message', ({ id, query }) => {
  try {
    const escaped = query.trim().replace(/["*]/g, '') + '*';
    parentPort.postMessage({ id, results: statement.all(escaped) });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
parentPort.on('close', () => db.close());
