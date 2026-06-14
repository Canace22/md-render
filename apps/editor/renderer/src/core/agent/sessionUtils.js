/**
 * Agent 会话的纯函数工具（无副作用，便于测试）。
 *
 * 会话结构：
 *   { id, title, messages: [], history: [], createdAt }
 *   - messages: 给 UI 显示的消息（{ role, text } 或 { role:'tool', label, status }）
 *   - history:  给模型复用的 OpenAI 格式对话历史
 */

let seq = 0;
const genId = () => `agent-${Date.now()}-${(seq += 1)}`;

export const createSession = (title = '新会话') => ({
  id: genId(),
  title,
  messages: [],
  history: [],
  createdAt: Date.now(),
});

/** 从首条用户消息派生会话标题（截断） */
export const deriveTitle = (text, maxLen = 18) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '新会话';
  return t.length <= maxLen ? t : `${t.slice(0, maxLen)}…`;
};

const MAX_ATTACH_CHARS = 6000;

/**
 * 把 @ 的文件内容拼到用户输入前面，作为上下文交给模型。
 * 每个文件用清晰分隔，单文件过长则截断，避免撑爆上下文。
 */
export const buildInputWithAttachments = (userText, attachedFiles = []) => {
  if (!attachedFiles.length) return userText;
  const blocks = attachedFiles.map((f) => {
    const content = String(f.content ?? '');
    const clipped = content.length > MAX_ATTACH_CHARS
      ? `${content.slice(0, MAX_ATTACH_CHARS)}\n…（内容过长已截断）`
      : content;
    return `【附件：${f.name}】\n${clipped}`;
  });
  return `${blocks.join('\n\n')}\n\n---\n\n${userText}`;
};

export const getActiveSession = (sessions, activeId) =>
  sessions.find((s) => s.id === activeId) || null;

/** 用 updater 更新指定会话，返回新数组（不可变） */
export const mapSession = (sessions, sessionId, updater) =>
  sessions.map((s) => (s.id === sessionId ? updater(s) : s));

/** 删除会话，返回 { sessions, nextActiveId }。删的是当前会话时自动选下一个；删空则补一个新会话 */
export const removeSession = (sessions, sessionId, activeId) => {
  const filtered = sessions.filter((s) => s.id !== sessionId);
  if (filtered.length === 0) {
    const fresh = createSession();
    return { sessions: [fresh], nextActiveId: fresh.id };
  }
  const nextActiveId = activeId === sessionId ? filtered[0].id : activeId;
  return { sessions: filtered, nextActiveId };
};
