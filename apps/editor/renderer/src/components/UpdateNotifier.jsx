import { useCallback, useEffect, useState } from 'react';
import { getUpdaterBridge } from '../services/electronBridge.js';

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
      setState(data);
      // 有新版本或已下载时重新显示（即使之前关闭过）
      if (data.status === 'available' || data.status === 'downloaded') {
        setDismissed(false);
      }
    });
  }, []);

  const handleDownload = useCallback(() => {
    getUpdaterBridge()?.download();
  }, []);

  const handleInstall = useCallback(() => {
    getUpdaterBridge()?.install();
  }, []);

  // 不显示的情况
  if (!state || dismissed) return null;
  if (state.status === 'checking' || state.status === 'up-to-date' || state.status === 'error') {
    return null;
  }

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        {state.status === 'available' && (
          <>
            <span>新版本 v{state.version} 可用</span>
            <button className="update-banner-btn" onClick={handleDownload}>
              下载更新
            </button>
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
