import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleStop,
  Copy,
  FileText,
  Loader2,
  User,
} from 'lucide-react';
import { buildAssistantRenderPayload } from '../core/agent/assistantResponse.js';
import AgentArtifactCard from './AgentArtifactCard.jsx';
import AgentMessageContent from './AgentMessageContent.jsx';

const ACTIVITY_LABELS = Object.freeze({
  thinking: '正在分析任务',
  working: '正在执行任务',
  finalizing: '正在整理结果',
});

const groupConversationItems = (messages) => {
  const items = [];
  messages.forEach((message, index) => {
    if (message.role !== 'tool') {
      items.push({ type: 'message', message, index });
      return;
    }

    const previous = items[items.length - 1];
    if (previous?.type === 'trace') {
      previous.steps.push({ ...message, index });
      return;
    }
    items.push({ type: 'trace', index, steps: [{ ...message, index }] });
  });
  return items;
};

const getTraceState = (steps) => {
  if (steps.some((step) => step.status === 'running')) return 'running';
  if (steps.some((step) => step.status === 'error')) return 'error';
  if (steps.some((step) => ['interrupted', 'stopped'].includes(step.status))) return 'interrupted';
  return 'done';
};

const TraceStatusIcon = ({ status }) => {
  if (status === 'running') return <Loader2 size={14} className="agent-panel__spin" />;
  if (status === 'error') return <CircleAlert size={14} />;
  if (['interrupted', 'stopped'].includes(status)) return <CircleStop size={14} />;
  return <CheckCircle2 size={14} />;
};

const AgentRunTrace = ({ steps, onOpenArtifact }) => {
  const traceState = getTraceState(steps);
  const activeStep = [...steps].reverse().find((step) => step.status === 'running');
  const artifactSteps = steps.filter((step) => step.result);
  const summary = activeStep
    ? `正在执行：${activeStep.label}`
    : traceState === 'interrupted'
      ? '已停止后续步骤'
      : traceState === 'error'
        ? '有步骤未完成'
        : `已执行 ${steps.length} 个步骤`;

  return (
    <div className="agent-run-trace-group">
      <details
        className={`agent-run-trace is-${traceState}`}
        defaultOpen={traceState !== 'done'}
      >
        <summary className="agent-run-trace__summary">
          <TraceStatusIcon status={traceState} />
          <span>{summary}</span>
          <ChevronDown size={14} className="agent-run-trace__chevron" />
        </summary>
        <div className="agent-run-trace__steps">
          {steps.map((step) => (
            <div key={step.callId || step.index} className={`agent-run-trace__step is-${step.status}`}>
              <span className="agent-run-trace__rail" aria-hidden="true" />
              <TraceStatusIcon status={step.status} />
              <span className="agent-run-trace__label">
                {step.label}
                {['interrupted', 'stopped'].includes(step.status) && '（结果未确认）'}
              </span>
            </div>
          ))}
        </div>
      </details>
      {artifactSteps.map((step) => (
        <AgentArtifactCard
          key={`artifact-${step.callId || step.index}`}
          result={step.result}
          onOpen={onOpenArtifact}
        />
      ))}
    </div>
  );
};

const AgentMessage = ({
  entry,
  copiedIndex,
  running,
  onChoice,
  onCopy,
}) => {
  const { message, index } = entry;
  const parsed = message.role === 'assistant'
    ? buildAssistantRenderPayload(message)
    : { displayText: message.text, choices: [] };

  return (
    <div className={`agent-panel__msg agent-panel__msg--${message.role}`}>
      <span className="agent-panel__avatar">
        {message.role === 'user' ? <User size={14} /> : <Bot size={14} />}
      </span>
      <div className="agent-panel__bubble">
        {message.files?.length > 0 && (
          <div className="agent-panel__msg-files">
            {message.files.map((name) => (
              <span key={name} className="agent-panel__msg-file">
                <FileText size={11} /> {name}
              </span>
            ))}
          </div>
        )}
        {message.role === 'assistant'
          ? <AgentMessageContent text={parsed.displayText} />
          : parsed.displayText}
        {message.role === 'assistant' && message.typing && (
          <span className="agent-panel__typing-cursor" aria-hidden="true" />
        )}
        {parsed.choices.length > 0 && (
          <div className="agent-panel__choice-cards">
            {parsed.choices.map((choice) => (
              <button
                key={`${choice.label}-${choice.title}`}
                type="button"
                className="agent-panel__choice-card"
                disabled={running}
                onClick={() => onChoice(choice)}
              >
                <span className="agent-panel__choice-label">{choice.label}</span>
                <span className="agent-panel__choice-main">
                  {choice.title && <span className="agent-panel__choice-title">{choice.title}</span>}
                  {choice.description && (
                    <span className="agent-panel__choice-desc">{choice.description}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        {message.role === 'assistant' && !message.typing && parsed.displayText && (
          <div className="agent-panel__message-actions">
            <button
              type="button"
              className={`agent-panel__copy-btn${copiedIndex === index ? ' is-copied' : ''}`}
              title={copiedIndex === index ? '已复制' : '复制'}
              onClick={() => onCopy(index, parsed.displayText)}
            >
              {copiedIndex === index ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedIndex === index ? '已复制' : '复制'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default function AgentConversation({
  messages,
  running,
  showActivity,
  activity,
  copiedIndex,
  onChoice,
  onCopy,
  onOpenArtifact,
}) {
  const items = groupConversationItems(messages);
  const hasRunningTool = messages.some(
    (message) => message.role === 'tool' && message.status === 'running',
  );

  return (
    <>
      {items.map((item) => (
        item.type === 'trace' ? (
          <AgentRunTrace
            key={`trace-${item.index}-${item.steps.map((step) => step.status).join('-')}`}
            steps={item.steps}
            onOpenArtifact={onOpenArtifact}
          />
        ) : (
          <AgentMessage
            key={`message-${item.index}`}
            entry={item}
            copiedIndex={copiedIndex}
            running={running}
            onChoice={onChoice}
            onCopy={onCopy}
          />
        )
      ))}
      {showActivity && activity && !hasRunningTool && (
        <div className="agent-panel__activity" aria-live="polite">
          <Loader2 size={14} className="agent-panel__spin" />
          <span>{ACTIVITY_LABELS[activity] || ACTIVITY_LABELS.thinking}</span>
          <span className="agent-panel__typing-dots" aria-hidden="true">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </div>
      )}
    </>
  );
}
