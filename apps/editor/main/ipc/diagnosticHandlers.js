const toStructuredError = (error) => ({
  code: 'DIAGNOSTICS_SNAPSHOT_FAILED',
  message: error?.message || String(error),
});

export function registerDiagnosticHandlers({ ipcMain, getDiagnosticsSnapshot }) {
  ipcMain.handle('diagnostics:get-snapshot', async (_event, payload = {}) => {
    try {
      return await getDiagnosticsSnapshot(payload);
    } catch (error) {
      return {
        ok: false,
        capturedAt: new Date().toISOString(),
        error: toStructuredError(error),
      };
    }
  });
}
