import { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';
import { getPlatform } from '../services/electronBridge.js';
import { openExternalUrl } from '../services/desktopShellBridge.js';
import { getUpdaterBridge } from '../services/updateBridge.js';

// Electron macOS 和 Tauri 包都只提示新版本，由用户前往 Release 页安装
const RELEASES_URL = 'https://github.com/Canace22/md-render/releases/latest';
const isManualUpdate = (state) => state?.manual === true || getPlatform() === 'darwin';

const BACKGROUND_STATUSES = ['checking', 'up-to-date', 'available'];
const BUSY_STATUSES = ['downloading', 'downloaded'];
const HIDDEN_STATUSES = ['checking', 'up-to-date', 'error'];

// 合并主进程推来的状态：下载中别被后台定时检查覆盖；用户点了下载后的失败要显示出来
function mergeUpdaterStatus(prev, next) {
  const prevStatus = prev?.status;
  if (BUSY_STATUSES.includes(prevStatus) && BACKGROUND_STATUSES.includes(next.status)) {
    return prev;
  }
  if (next.status === 'error' && prevStatus === 'downloading') {
    return { ...prev, status: 'download-failed', message: next.message };
  }
  return { ...prev, ...next };
}

/**
 * 自动更新通知条 —— 类似 Claude APP 的顶部 banner
 * 状态流：available → downloading → downloaded → 用户点击重启安装
 */
export default function UpdateNotifier() {
  const [state, setState] = useState(null); // { status, version, percent, message }
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = getUpdaterBridge();
    if (!api) return;
    return api.onStatus((data) => {
      setState((prev) => mergeUpdaterStatus(prev, data));
      // 有新版本或已下载时重新显示（即使之前关闭过）
      if (data.status === 'available' || data.status === 'downloaded') {
        setDismissed(false);
      }
    });
  }, []);

  const handleDownload = useCallback(() => {
    // 先给反馈：真正的进度要等连上下载地址后才会推过来，网络慢时可能要等很久
    setState((prev) => ({ ...prev, status: 'downloading', percent: 0 }));
    getUpdaterBridge()?.download();
  }, []);

  const handleOpenReleases = useCallback(() => {
    openExternalUrl(state?.releaseUrl || RELEASES_URL).catch((error) => {
      message.error(error?.message || '无法打开下载页');
    });
  }, [state?.releaseUrl]);

  const handleInstall = useCallback(() => {
    getUpdaterBridge()?.install();
  }, []);

  // 不显示的情况
  if (!state || dismissed) return null;
  if (HIDDEN_STATUSES.includes(state.status)) return null;

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        {state.status === 'available' && (
          <>
            <span>新版本 v{state.version} 可用</span>
            {isManualUpdate(state) ? (
              <button className="update-banner-btn" onClick={handleOpenReleases}>
                前往下载
              </button>
            ) : (
              <button className="update-banner-btn" onClick={handleDownload}>
                下载更新
              </button>
            )}
          </>
        )}

        {state.status === 'downloading' && (
          <>
            <span>正在下载更新… {state.percent ?? 0}%</span>
            <div className="update-banner-progress">
              <div
                className="update-banner-progress-bar"
                style={{ width: `${state.percent ?? 0}%` }}
              />
            </div>
            <button className="update-banner-btn" onClick={handleOpenReleases}>
              太慢？手动下载
            </button>
          </>
        )}

        {state.status === 'download-failed' && (
          <>
            <span title={state.message}>更新下载失败</span>
            <button className="update-banner-btn" onClick={handleOpenReleases}>
              前往下载
            </button>
          </>
        )}

        {state.status === 'downloaded' && (
          <>
            <span>更新已就绪</span>
            <button className="update-banner-btn primary" onClick={handleInstall}>
              重启并安装
            </button>
          </>
        )}
      </div>
      <button
        className="update-banner-close"
        onClick={() => setDismissed(true)}
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  );
}
