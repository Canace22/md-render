import { useEffect, useState } from 'react';
import { Modal, Progress } from 'antd';
import { onMigrationProgress } from '../utils/vaultBridge.js';
import { previewVaultMigration, runVaultMigration } from '../services/vaultMigration.js';

const STEPS = Object.freeze({ INTRO: 'intro', PLANNING: 'planning', REPORT: 'report', RUNNING: 'running', DONE: 'done', ERROR: 'error' });
const PERCENT = 100;

function ProgressView({ progress }) {
  const percent = progress?.total ? Math.round((progress.done / progress.total) * PERCENT) : null;
  return (
    <div className="migration-wizard__progress">
      <p>正在{progress?.phase || '准备'}… 期间请不要编辑，完成后会自动切换。</p>
      {percent != null ? <Progress percent={percent} /> : <Progress percent={PERCENT} status="active" showInfo={false} />}
    </div>
  );
}

/**
 * 迁移向导（U5）：说明 → 预演报告 → 确认 → 进度（期间不可操作）→ 完成，并告诉用户回滚入口。
 * @param {{ open: boolean, onClose: () => void, toMarkdown: (content: string) => string }} props
 */
export default function MigrationWizard({ open, onClose, toMarkdown }) {
  const [step, setStep] = useState(STEPS.INTRO);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    setStep(STEPS.INTRO);
    setPreview(null);
    setResult(null);
    setError('');
    return onMigrationProgress(setProgress);
  }, [open]);

  const handlePreview = async () => {
    setStep(STEPS.PLANNING);
    try {
      setPreview(await previewVaultMigration({ toMarkdown }));
      setStep(STEPS.REPORT);
    } catch (err) {
      setError(err.message);
      setStep(STEPS.ERROR);
    }
  };

  const handleRun = async () => {
    setStep(STEPS.RUNNING);
    try {
      setResult(await runVaultMigration({ toMarkdown }));
      setStep(STEPS.DONE);
    } catch (err) {
      setError(err.message);
      setStep(STEPS.ERROR);
    }
  };

  const running = step === STEPS.RUNNING || step === STEPS.PLANNING;
  const footer = {
    [STEPS.INTRO]: [
      <button key="cancel" type="button" className="migration-wizard__btn" onClick={onClose}>以后再说</button>,
      <button key="go" type="button" className="migration-wizard__btn is-primary" onClick={handlePreview}>先预演（只读）</button>,
    ],
    [STEPS.REPORT]: [
      <button key="cancel" type="button" className="migration-wizard__btn" onClick={onClose}>不迁移</button>,
      <button key="go" type="button" className="migration-wizard__btn is-primary" onClick={handleRun}>确认迁移</button>,
    ],
    [STEPS.DONE]: [<button key="ok" type="button" className="migration-wizard__btn is-primary" onClick={onClose}>完成</button>],
    [STEPS.ERROR]: [<button key="ok" type="button" className="migration-wizard__btn" onClick={onClose}>关闭</button>],
  }[step] ?? null;

  return (
    <Modal
      open={open}
      title="把数据迁到内容库文件"
      onCancel={running ? undefined : onClose}
      closable={!running}
      maskClosable={false}
      keyboard={!running}
      footer={footer}
      width={680}
      className="migration-wizard"
    >
      {step === STEPS.INTRO && (
        <div className="migration-wizard__intro">
          <p>把编辑部记忆、Daily、白板和内置文档搬到 <code>~/Documents/MdRender</code> 下的真文件，之后 Obsidian、Claude Code 等工具也能直接读写。</p>
          <ul>
            <li>先预演：只读扫描，列出会写哪些文件、改哪些名、有哪些冲突，不做任何修改。</li>
            <li>正式迁移前会完整备份数据库，内容库不太大时还会做一次 git 快照。</li>
            <li>只增不删：旧数据库和本机缓存都保留，随时可以在「设置 → 数据存储」切回旧存储。</li>
          </ul>
        </div>
      )}
      {step === STEPS.PLANNING && <ProgressView progress={{ phase: '预演' }} />}
      {step === STEPS.REPORT && preview && (
        <div className="migration-wizard__report">
          {Object.keys(preview.blockers ?? {}).length > 0 && (
            <div className="agent-panel__skill-warnings">有冲突的步骤会跳过，其余照常迁移；详情见报告末尾。</div>
          )}
          <pre>{preview.report}</pre>
        </div>
      )}
      {step === STEPS.RUNNING && <ProgressView progress={progress} />}
      {step === STEPS.DONE && result && (
        <div className="migration-wizard__done">
          <p>迁移完成：{result.steps.join('、') || '没有需要迁移的数据'}。</p>
          {result.conflicts.length > 0 && <p>有 {result.conflicts.length} 个文件已存在，没有覆盖，详见报告。</p>}
          <p>报告：<code>{result.reportPath}</code></p>
          <p>需要回滚时：设置 → 数据存储 → 切回旧存储。</p>
        </div>
      )}
      {step === STEPS.ERROR && (
        <div className="migration-wizard__error">
          <p>迁移没有完成：{error}</p>
          <p>旧数据没有被改动，可以稍后重试。</p>
        </div>
      )}
    </Modal>
  );
}
