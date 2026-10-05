/**
 * 面板消息列表里「流式回复」和「出错重试」相关的纯函数（不可变更新，可单测）。
 *
 * 流式回复：第一段文字到达时追加一条 { role:'assistant', typing:true, streamId } 消息，
 * 后续片段只往这条里追加；结束、调用工具或停止时把 typing 去掉。
 */

const findStreamIndex = (messages, streamId) => (
  streamId ? messages.findIndex((item) => item.streamId === streamId) : -1
);

/** 追加一段流式文字：没有这条消息就新建 */
export const appendStreamDelta = (messages, streamId, text) => {
  if (!text) return messages;
  const index = findStreamIndex(messages, streamId);
  if (index < 0) return [...messages, { role: 'assistant', text, typing: true, streamId }];
  const next = [...messages];
  next[index] = { ...next[index], text: `${next[index].text ?? ''}${text}` };
  return next;
};

/** 某一步的流式文字结束（比如接下来要调用工具） */
export const endStreamMessage = (messages, streamId) => {
  const index = findStreamIndex(messages, streamId);
  if (index < 0 || !messages[index].typing) return messages;
  const next = [...messages];
  next[index] = { ...next[index], typing: false };
  return next;
};

/** 最终答复：已有流式消息就用规整后的全文替换它，否则追加一条 */
export const finalizeAssistantReply = (messages, streamId, finalText) => {
  const index = findStreamIndex(messages, streamId);
  if (index < 0) return [...messages, { role: 'assistant', text: finalText }];
  const next = [...messages];
  next[index] = { ...next[index], text: finalText, typing: false };
  return next;
};

/** 用户点停止：所有还在打字的消息收尾，标记「已停止」，已经输出的内容保留 */
export const stopTypingMessages = (messages) => messages.map((item) => (
  item.role === 'assistant' && item.typing
    ? { ...item, typing: false, stopped: true }
    : item
));

const CONNECTION_ERROR_PATTERN = /连接失败|超时|fetch failed|未配置 AI|AI 代理|ECONNREFUSED|ENOTFOUND|network/i;

/** 连接 / 配置类错误：除了重试，还给一个「打开设置」 */
export const isConnectionError = (text) => CONNECTION_ERROR_PATTERN.test(String(text ?? ''));

/**
 * 出错消息：带上重试需要的参数（只在内存会话里，不落盘）。
 * retry 为空时只显示错误，不给重试按钮。
 */
export const buildErrorMessage = (errorText, retry = null) => ({
  role: 'assistant',
  text: `出错了：${errorText}`,
  error: true,
  connectionError: isConnectionError(errorText),
  ...(retry ? { retry } : {}),
});

/** 点重试时先把这条出错消息移走，避免对话里堆一串错误 */
export const removeMessageAt = (messages, index) => messages.filter((_item, i) => i !== index);
