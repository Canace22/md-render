import { memo } from 'react';
import { message } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openExternalUrl } from '../services/desktopShellBridge.js';

const MARKDOWN_PLUGINS = [remarkGfm];

const handleExternalLink = (event, href) => {
  event.preventDefault();
  openExternalUrl(href).catch((error) => {
    message.error(error?.message || '无法打开链接');
  });
};

function AgentMessageContent({ text }) {
  if (!text) return null;

  return (
    <div className="agent-message-markdown">
      <ReactMarkdown
        remarkPlugins={MARKDOWN_PLUGINS}
        skipHtml
        components={{
          a: ({ children, href, title }) => (
            <a
              href={href}
              title={title}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => handleExternalLink(event, href)}
            >
              {children}
            </a>
          ),
          img: ({ alt }) => (
            <span className="agent-message-markdown__image-placeholder">
              已阻止加载外部图片{alt ? `：${alt}` : ''}
            </span>
          ),
          table: ({ children }) => (
            <div className="agent-message-markdown__table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(AgentMessageContent);
