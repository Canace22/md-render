import { useMemo, useRef, useState } from 'react';
import { Button, message, Tooltip } from 'antd';
import {
  Braces,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Clipboard,
  Download,
  Eraser,
  FileUp,
  Minimize2,
  WandSparkles,
} from 'lucide-react';
import JsonTree from './JsonTree.jsx';
import JsonSearchBar from './JsonSearchBar.jsx';
import { countJsonNodes, formatJson, parseJson } from './jsonUtils.js';
import useJsonSearch from './useJsonSearch.js';
import './json-tool.css';

const DOWNLOAD_FILE_NAME = 'data.json';

const downloadJson = (content) => {
  const blobUrl = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = DOWNLOAD_FILE_NAME;
  link.click();
  URL.revokeObjectURL(blobUrl);
};

const getByteLength = (content) => new TextEncoder().encode(content).length;

export default function JsonTool() {
  const [source, setSource] = useState('');
  const [expansionSignal, setExpansionSignal] = useState({ version: 0, expanded: null });
  const fileInputRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const editorRef = useRef(null);
  const search = useJsonSearch({ source, editorRef });
  const parsed = useMemo(() => parseJson(source), [source]);
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(source.split('\n').length, 1) }, (_, index) => index + 1).join('\n'),
    [source],
  );
  const nodeCount = parsed.status === 'valid' ? countJsonNodes(parsed.value) : 0;

  const requireValidJson = () => {
    if (parsed.status === 'valid') return true;
    message.error(parsed.status === 'empty' ? '请先输入 JSON' : '请先修复 JSON 语法错误');
    return false;
  };

  const handleFormat = () => {
    if (!requireValidJson()) return;
    setSource(formatJson(parsed.value, 2));
    message.success('JSON 已格式化');
  };

  const handleMinify = () => {
    if (!requireValidJson()) return;
    setSource(formatJson(parsed.value, 0));
    message.success('JSON 已压缩');
  };

  const handleCopy = async () => {
    if (!source.trim()) {
      message.error('没有可复制的内容');
      return;
    }
    try {
      await navigator.clipboard.writeText(source);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const handleDownload = () => {
    if (!requireValidJson()) return;
    downloadJson(formatJson(parsed.value, 2));
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      setSource(content);
      message.success(`已导入 ${file.name}`);
    } catch {
      message.error('文件读取失败');
    }
  };

  const handleExpandAll = (expanded) => {
    setExpansionSignal((current) => ({ version: current.version + 1, expanded }));
  };

  const handleEditorScroll = (event) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  };

  const handleEditorKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      handleFormat();
    }
  };

  return (
    <section className="json-tool-shell" aria-label="JSON 解析工具">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json,text/plain"
        onChange={handleImport}
        className="json-tool-file-input"
        aria-hidden
      />

      <header className="json-tool-header">
        <div className="json-tool-title-wrap">
          <span className="json-tool-title-icon"><Braces size={18} strokeWidth={1.8} /></span>
          <div>
            <h1>JSON 解析器</h1>
            <p>校验、格式化并逐层查看 JSON 数据</p>
          </div>
        </div>

        <div className="json-tool-actions">
          <Tooltip title="导入 JSON 文件">
            <Button size="small" icon={<FileUp size={15} />} onClick={() => fileInputRef.current?.click()}>
              导入
            </Button>
          </Tooltip>
          <Tooltip title="格式化（⌘/Ctrl + Shift + F）">
            <Button size="small" icon={<WandSparkles size={15} />} onClick={handleFormat}>格式化</Button>
          </Tooltip>
          <Tooltip title="移除多余空白">
            <Button size="small" icon={<Minimize2 size={15} />} onClick={handleMinify}>压缩</Button>
          </Tooltip>
          <Tooltip title="复制当前文本">
            <Button size="small" icon={<Clipboard size={15} />} onClick={handleCopy} />
          </Tooltip>
          <Tooltip title="下载格式化后的 JSON">
            <Button size="small" icon={<Download size={15} />} onClick={handleDownload} />
          </Tooltip>
          <Tooltip title="清空">
            <Button size="small" danger icon={<Eraser size={15} />} onClick={() => setSource('')} />
          </Tooltip>
        </div>
      </header>

      <JsonSearchBar
        activeIndex={search.activeIndex}
        inputRef={search.inputRef}
        matchCount={search.matchCount}
        onClose={search.closeSearch}
        onNavigate={search.navigate}
        onQueryChange={search.updateQuery}
        open={search.isOpen}
        query={search.query}
      />

      <div className="json-tool-workspace">
        <section className="json-tool-pane json-tool-source-pane">
          <div className="json-tool-pane-header">
            <span>原始 JSON</span>
            <span className="json-tool-meta">{source.split('\n').length} 行 · {getByteLength(source)} bytes</span>
          </div>
          <div className="json-tool-editor-wrap">
            <pre ref={lineNumbersRef} className="json-tool-line-numbers" aria-hidden>{lineNumbers}</pre>
            <textarea
              ref={editorRef}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              onScroll={handleEditorScroll}
              onKeyDown={handleEditorKeyDown}
              className="json-tool-editor"
              placeholder={'在此粘贴 JSON，例如：\n{\n  "name": "MD Render"\n}'}
              spellCheck={false}
              aria-label="JSON 原始文本"
            />
          </div>
          {parsed.status === 'invalid' && (
            <div className="json-tool-error" role="alert">
              <strong>第 {parsed.error.line} 行，第 {parsed.error.column} 列</strong>
              <span>{parsed.error.message}</span>
            </div>
          )}
        </section>

        <section className="json-tool-pane json-tool-tree-pane">
          <div className="json-tool-pane-header">
            <div className="json-tool-preview-status">
              <span>结构预览</span>
              {parsed.status === 'valid' && (
                <span className="json-tool-valid"><Check size={13} /> 有效 JSON · {nodeCount} 个节点</span>
              )}
            </div>
            <div className="json-tool-tree-actions">
              <Tooltip title="全部展开">
                <Button size="small" type="text" icon={<ChevronsUpDown size={15} />} onClick={() => handleExpandAll(true)} />
              </Tooltip>
              <Tooltip title="全部收起">
                <Button size="small" type="text" icon={<ChevronsDownUp size={15} />} onClick={() => handleExpandAll(false)} />
              </Tooltip>
            </div>
          </div>
          <div className="json-tool-tree-scroll">
            {parsed.status === 'valid' ? (
              <JsonTree value={parsed.value} expansionSignal={expansionSignal} />
            ) : (
              <div className="json-tool-empty">
                <Braces size={34} strokeWidth={1.3} />
                <strong>{parsed.status === 'empty' ? '等待 JSON 输入' : '暂时无法生成结构'}</strong>
                <span>{parsed.status === 'empty' ? '在左侧粘贴或导入 JSON 文件' : '修复左侧语法错误后会自动更新'}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
