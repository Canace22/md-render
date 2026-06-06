import { useMemo, useState } from 'react';
import { FileText, ArrowRightLeft, Loader2 } from 'lucide-react';
import { getFileTypeLabel } from '../utils/fileConverters.js';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac']);

/**
 * 非 Markdown 文件只读预览面板
 * 支持：HTML 渲染、CSV 表格、JSON 格式化、图片/视频/音频、DOCX 转 HTML 预览等
 */
const EXCEL_EXTS = new Set(['.xlsx', '.xls']);

const FilePreviewPanel = ({
  file,
  previewHtml,
  rawContent,
  fileUrl,
  excelSheets,
  loading,
  onConvertToMarkdown,
}) => {
  const typeLabel = useMemo(() => getFileTypeLabel(file?.name), [file?.name]);
  const ext = useMemo(() => {
    const match = String(file?.name ?? '').match(/\.[^.]+$/);
    return match ? match[0].toLowerCase() : '';
  }, [file?.name]);

  const isImage = IMAGE_EXTS.has(ext);
  const isVideo = VIDEO_EXTS.has(ext);
  const isAudio = AUDIO_EXTS.has(ext);
  const isExcel = EXCEL_EXTS.has(ext);
  const isMedia = isImage || isVideo || isAudio;

  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const activeSheet = excelSheets?.[activeSheetIdx] ?? null;

  if (loading) {
    return (
      <div className="file-preview-panel">
        <div className="file-preview-loading">
          <Loader2 size={24} className="spin" />
          <span>正在加载预览…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="file-preview-panel">
      {/* 顶部信息栏 */}
      <div className="file-preview-header">
        <div className="file-preview-badge">
          <FileText size={14} strokeWidth={1.5} />
          <span>{typeLabel} 预览</span>
          <span className="file-preview-filename">{file?.name}</span>
        </div>
        {/* 媒体文件不提供转 Markdown 按钮 */}
        {onConvertToMarkdown && !isMedia && !isExcel && (
          <button
            type="button"
            className="file-preview-convert-btn"
            onClick={onConvertToMarkdown}
            title="转换为 Markdown 并编辑"
          >
            <ArrowRightLeft size={14} strokeWidth={1.5} />
            转为 Markdown 编辑
          </button>
        )}
      </div>

      {/* 预览内容 */}
      <div className="file-preview-body">
        {isExcel && activeSheet ? (
          <ExcelSheetView
            sheets={excelSheets}
            activeIdx={activeSheetIdx}
            onChangeSheet={setActiveSheetIdx}
          />
        ) : isImage ? (
          <div className="file-preview-media">
            <img src={fileUrl} alt={file?.name} className="file-preview-image" />
          </div>
        ) : isVideo ? (
          <div className="file-preview-media">
            <video src={fileUrl} controls className="file-preview-video">
              您的浏览器不支持视频播放
            </video>
          </div>
        ) : isAudio ? (
          <div className="file-preview-media file-preview-audio-wrap">
            <audio src={fileUrl} controls className="file-preview-audio">
              您的浏览器不支持音频播放
            </audio>
          </div>
        ) : ext === '.csv' ? (
          <div
            className="file-preview-content file-preview-table"
            dangerouslySetInnerHTML={{ __html: csvToHtmlTable(rawContent) }}
          />
        ) : ext === '.json' ? (
          <pre className="file-preview-content file-preview-code">
            <code>{formatJson(rawContent)}</code>
          </pre>
        ) : (ext === '.html' || ext === '.htm') ? (
          <iframe
            className="file-preview-iframe"
            srcDoc={rawContent}
            title={`${file?.name} 预览`}
            sandbox="allow-scripts"
          />
        ) : previewHtml ? (
          <div
            className="file-preview-content"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : (
          <pre className="file-preview-content file-preview-code">
            <code>{rawContent || '（空文件）'}</code>
          </pre>
        )}
      </div>
    </div>
  );
};

// ─── Excel Sheet 预览组件 ───────────────────────────────────────────────────

const MAX_PREVIEW_ROWS = 500;

const ExcelSheetView = ({ sheets, activeIdx, onChangeSheet }) => {
  const sheet = sheets[activeIdx];
  const rows = sheet?.rows ?? [];
  const truncated = rows.length > MAX_PREVIEW_ROWS;
  const displayRows = truncated ? rows.slice(0, MAX_PREVIEW_ROWS) : rows;

  return (
    <div className="excel-preview">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="excel-sheet-tabs">
          {sheets.map((s, idx) => (
            <button
              key={s.name}
              type="button"
              className={`excel-sheet-tab${idx === activeIdx ? ' active' : ''}`}
              onClick={() => onChangeSheet(idx)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="file-preview-content file-preview-table excel-table-wrap">
        {rows.length === 0 ? (
          <p className="excel-empty-hint">（空工作表）</p>
        ) : (
          <>
            <table className="preview-table">
              <thead>
                <tr>
                  <th className="excel-row-num">#</th>
                  {(displayRows[0] || []).map((_, ci) => (
                    <th key={ci}>{colLabel(ci)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, ri) => (
                  <tr key={ri}>
                    <td className="excel-row-num">{ri + 1}</td>
                    {row.map((cell, ci) => (
                      <td key={ci}>{formatCell(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {truncated && (
              <p className="excel-truncated-hint">
                仅显示前 {MAX_PREVIEW_ROWS} 行（共 {rows.length} 行）
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/** 列索引 → Excel 风格列名 (A, B, ... Z, AA, AB, ...) */
const colLabel = (idx) => {
  let label = '';
  let n = idx;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
};

/** 格式化单元格值 */
const formatCell = (val) => {
  if (val == null || val === '') return '';
  if (typeof val === 'number') return String(val);
  return String(val);
};

// ─── 内部工具 ────────────────────────────────────────────────────────────────

function csvToHtmlTable(csv) {
  if (!csv?.trim()) return '<p>（空文件）</p>';
  const lines = csv.trim().split('\n');
  const rows = lines.map((line) => parseCsvRow(line));
  if (rows.length === 0) return '<p>（空文件）</p>';

  let html = '<table class="preview-table"><thead><tr>';
  for (const cell of rows[0]) {
    html += `<th>${escapeHtml(cell)}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (let i = 1; i < rows.length; i++) {
    html += '<tr>';
    for (const cell of rows[i]) {
      html += `<td>${escapeHtml(cell)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function parseCsvRow(line) {
  const cells = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else if (ch === '"') { inQuotes = true; }
    else if (ch === ',') { cells.push(cell.trim()); cell = ''; }
    else { cell += ch; }
  }
  cells.push(cell.trim());
  return cells;
}

function formatJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text || '';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default FilePreviewPanel;
