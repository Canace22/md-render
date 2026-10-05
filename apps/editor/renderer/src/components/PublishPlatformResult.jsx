import { Alert, Button, Tag } from 'antd';
import { Check, Copy, Eye, Save } from 'lucide-react';

function CopyButton({ copyKey, value, copiedKey, onCopy }) {
  const copied = copiedKey === copyKey;
  return (
    <Button
      type="text"
      size="small"
      icon={copied ? <Check size={14} /> : <Copy size={14} />}
      onClick={() => onCopy(copyKey, value)}
    >
      {copied ? '已复制' : '复制'}
    </Button>
  );
}

function ResultBlock({ title, copyKey, copyValue, copiedKey, onCopy, children }) {
  return (
    <section className="prepare-publish-result-block">
      <div className="prepare-publish-result-heading">
        <strong>{title}</strong>
        <CopyButton
          copyKey={copyKey}
          value={copyValue}
          copiedKey={copiedKey}
          onCopy={onCopy}
        />
      </div>
      {children}
    </section>
  );
}

export default function PublishPlatformResult({
  platform,
  copiedKey,
  onCopy,
  onPreview,
  onSave,
  saving,
  saveDisabled,
  saved,
}) {
  if (platform.error || !platform.result) {
    return <Alert type="error" showIcon message={`${platform.label}生成失败`} description={platform.error} />;
  }

  const { titles, summary, tags, body } = platform.result;
  const titleText = titles.map((title, index) => `${index + 1}. ${title}`).join('\n');
  const tagText = tags.map((tag) => `#${tag}`).join(' ');
  const prefix = platform.id;

  return (
    <div className="prepare-publish-result">
      <ResultBlock
        title="标题备选"
        copyKey={`${prefix}-titles`}
        copyValue={titleText}
        copiedKey={copiedKey}
        onCopy={onCopy}
      >
        <ol className="prepare-publish-title-list">
          {titles.map((title) => <li key={title}>{title}</li>)}
        </ol>
      </ResultBlock>

      <ResultBlock
        title="摘要"
        copyKey={`${prefix}-summary`}
        copyValue={summary}
        copiedKey={copiedKey}
        onCopy={onCopy}
      >
        <p>{summary}</p>
      </ResultBlock>

      <ResultBlock
        title="标签"
        copyKey={`${prefix}-tags`}
        copyValue={tagText}
        copiedKey={copiedKey}
        onCopy={onCopy}
      >
        <div className="prepare-publish-tags">
          {tags.map((tag) => <Tag key={tag}>#{tag}</Tag>)}
        </div>
      </ResultBlock>

      <ResultBlock
        title="正文"
        copyKey={`${prefix}-body`}
        copyValue={body}
        copiedKey={copiedKey}
        onCopy={onCopy}
      >
        <pre className="prepare-publish-body">{body}</pre>
      </ResultBlock>

      <div className="prepare-publish-result-actions">
        {platform.id === 'wechat' && (
          <Button icon={<Eye size={15} />} onClick={() => onPreview(platform.result)}>
            预览排版
          </Button>
        )}
        <Button
          type="primary"
          icon={saved ? <Check size={15} /> : <Save size={15} />}
          loading={saving}
          disabled={saved || (saveDisabled && !saving)}
          onClick={() => onSave(platform)}
        >
          {saved ? '已保存' : '保存为平台稿'}
        </Button>
      </div>
    </div>
  );
}
