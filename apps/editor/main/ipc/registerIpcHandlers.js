import { registerAiHandlers } from './aiHandlers.js';
import { registerDbHandlers } from './dbHandlers.js';
import { registerDiagnosticHandlers } from './diagnosticHandlers.js';
import { registerExportHandlers } from './exportHandlers.js';
import { registerLocalProjectHandlers } from './localProjectHandlers.js';
import { registerUpdaterHandlers } from './updaterHandlers.js';
import { registerWindowHandlers } from './windowHandlers.js';

export function registerIpcHandlers(deps) {
  registerLocalProjectHandlers(deps);
  registerAiHandlers(deps);
  registerDiagnosticHandlers(deps);
  registerExportHandlers(deps);
  registerWindowHandlers(deps);
  registerDbHandlers(deps);
  registerUpdaterHandlers(deps);
}
