import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import MarkdownEditor from './components/MarkdownEditor.jsx';
import TauriPreviewNotice from './components/TauriPreviewNotice.jsx';
import {
  getDesktopRuntimeInfo,
  getDesktopRuntimeKind,
} from './services/desktopBridge.js';

const desktopRuntimeKind = getDesktopRuntimeKind();

if (desktopRuntimeKind === 'tauri') {
  getDesktopRuntimeInfo()
    .then((info) => console.info('[desktop-runtime]', info))
    .catch((error) => console.error('[desktop-runtime] 探测失败', error));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {desktopRuntimeKind === 'tauri' && <TauriPreviewNotice />}
    <MarkdownEditor />
  </React.StrictMode>
);
