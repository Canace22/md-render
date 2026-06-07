import { useRef, useState } from 'react';
import { Bookmark, FileUp, Link2, X } from 'lucide-react';
import { parseBookmarkHtml, parseUrlList } from '../utils/bookmarkImport.js';

const TABS = [
  { id: 'file', label: '书签文件', icon: FileUp },
  { id: 'paste', label: '粘贴链接', icon: Link2 },
];

export default function BookmarkImportModal({ open, onClose, onImport }) {
  const [tab, setTab] = useState('file');
  const [items, setItems] = useState([]);
  const [fileName, setFileName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  if (!open) return null;

  const reset = () => {
    setItems([]);
    setFileName('');
    setPasteText('');
    setTab('file');
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setItems(parseBookmarkHtml(String(reader.result ?? '')));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePasteChange = (e) => {
    const value = e.target.value;
    setPasteText(value);
    setItems(parseUrlList(value));
  };

  const handleImport = async () => {
    if (items.length === 0) return;
    setImporting(true);
    try {
      const result = await onImport?.(items);
      handleClose();
      return result;
    } catch {
      return null;
    } finally {
      setImporting(false);
    }
  };

  const switchTab = (next) => {
    setTab(next);
    setItems([]);
    setFileName('');
    setPasteText('');
  };

  return (
    <div
      className="bookmark-import-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bookmark-import-title"
    >
      <div className="bookmark-import-modal" data-testid="bookmark-import-modal">
        <div className="bookmark-import-header">
          <div className="bookmark-import-heading">
            <Bookmark size={18} strokeWidth={1.8} aria-hidden />
            <h2 id="bookmark-import-title">导入浏览器书签</h2>
          </div>
          <button type="button" className="bookmark-import-close" onClick={handleClose} aria-label="关闭">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="bookmark-import-tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`bookmark-import-tab${tab === id ? ' is-active' : ''}`}
              onClick={() => switchTab(id)}
            >
              <Icon size={15} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="bookmark-import-body">
          {tab === 'file' ? (
            <div className="bookmark-import-file">
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,text/html"
                style={{ display: 'none' }}
                onChange={handleFileChange}
                data-testid="bookmark-import-file-input"
                aria-hidden
              />
              <button
                type="button"
                className="bookmark-import-dropzone"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp size={24} strokeWidth={1.6} />
                <strong>{fileName || '选择导出的书签 HTML 文件'}</strong>
                <span>Chrome / Edge / Safari / Firefox 的「导出书签」均可</span>
              </button>
            </div>
          ) : (
            <textarea
              className="bookmark-import-textarea"
              value={pasteText}
              onChange={handlePasteChange}
              placeholder={'每行粘贴一个链接，可带标题：\nhttps://example.com\n设计灵感 | https://dribbble.com'}
              data-testid="bookmark-import-textarea"
            />
          )}

          {items.length > 0 && (
            <div className="bookmark-import-preview">
              <div className="bookmark-import-preview-meta">
                解析到 <strong>{items.length}</strong> 条链接
              </div>
              <ul className="bookmark-import-preview-list">
                {items.slice(0, 8).map((item) => (
                  <li key={item.url} title={item.url}>
                    <span className="bookmark-import-preview-title">{item.title}</span>
                    <span className="bookmark-import-preview-url">{item.url}</span>
                  </li>
                ))}
                {items.length > 8 && (
                  <li className="bookmark-import-preview-more">…还有 {items.length - 8} 条</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="bookmark-import-actions">
          <button type="button" className="bookmark-import-btn secondary" onClick={handleClose}>
            取消
          </button>
          <button
            type="button"
            className="bookmark-import-btn primary"
            onClick={handleImport}
            disabled={items.length === 0 || importing}
          >
            {importing ? '导入中…' : `导入 ${items.length || ''} 条`}
          </button>
        </div>
      </div>
    </div>
  );
}
