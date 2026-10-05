import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Modal, Spin, Tabs, message } from 'antd';

import { MarkdownParser, MarkdownRenderer } from '../core';
import {
  PUBLISH_PLATFORM_DEFINITIONS,
  runPublishPreparation,
} from '../core/agent/publishPreparation.js';
import PublishPlatformResult from './PublishPlatformResult.jsx';
import WechatPreviewModal from './WechatPreviewModal.jsx';

const COPY_FEEDBACK_MS = 1600;
const markdownParser = new MarkdownParser();
const markdownRenderer = new MarkdownRenderer();

const copyText = async (value) => {
  if (!navigator.clipboard?.writeText) throw new Error('当前环境不支持剪贴板');
  await navigator.clipboard.writeText(value);
};

export default function PreparePublishModal({
  open,
  onClose,
  sourceFile,
  sourceContent,
  skills = [],
  initialTemplateId = 'default',
  onTemplateChange,
  onSavePlatform,
}) {
  const [selectedPlatforms, setSelectedPlatforms] = useState(['wechat']);
  const [includeReview, setIncludeReview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');
  const [previewResult, setPreviewResult] = useState(null);
  const [savingPlatform, setSavingPlatform] = useState('');
  const [savedPlatforms, setSavedPlatforms] = useState([]);
  const controllerRef = useRef(null);
  const saveLockRef = useRef(false);
  const saveGenerationRef = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    const available = new Set(PUBLISH_PLATFORM_DEFINITIONS.map((item) => item.id));
    const preferred = (sourceFile?.targetPlatforms ?? []).filter((id) => available.has(id));
    setSelectedPlatforms(preferred.length ? preferred : ['wechat']);
    setIncludeReview(false);
    setLoading(false);
    setOutput(null);
    setCopiedKey('');
    setPreviewResult(null);
    setSavingPlatform('');
    setSavedPlatforms([]);
    saveLockRef.current = false;
    saveGenerationRef.current += 1;
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      saveGenerationRef.current += 1;
    };
  }, [open, sourceFile?.id]);

  const handleClose = () => {
    if (saveLockRef.current) return;
    controllerRef.current?.abort();
    controllerRef.current = null;
    saveGenerationRef.current += 1;
    setPreviewResult(null);
    onClose?.();
  };

  const handleGenerate = async () => {
    if (controllerRef.current && !controllerRef.current.signal.aborted) return;
    if (!selectedPlatforms.length) {
      message.warning('请至少选择一个平台');
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setOutput(null);
    setSavedPlatforms([]);
    try {
      const next = await runPublishPreparation({
        sourceContent,
        platformIds: selectedPlatforms,
        includeReview,
        skills,
        projectRoot: sourceFile?.projectRootPath ?? '',
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setOutput(next);
    } catch (error) {
      if (!controller.signal.aborted) message.error(error?.message || '生成失败');
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  };

  const handleCopy = async (key, value) => {
    try {
      await copyText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), COPY_FEEDBACK_MS);
    } catch (error) {
      message.error(error?.message || '复制失败');
    }
  };

  const handleSave = async (platform) => {
    if (saveLockRef.current) return;
    const sourceId = sourceFile?.id ?? '';
    const saveGeneration = saveGenerationRef.current;
    saveLockRef.current = true;
    setSavingPlatform(platform.id);
    try {
      await onSavePlatform?.(platform);
      if (saveGenerationRef.current !== saveGeneration || sourceFile?.id !== sourceId) return;
      setSavedPlatforms((current) => [...new Set([...current, platform.id])]);
      message.success(`已保存${platform.label}平台稿`);
    } catch (error) {
      if (saveGenerationRef.current !== saveGeneration) return;
      message.error(error?.message || '保存失败');
    } finally {
      if (saveGenerationRef.current === saveGeneration) {
        saveLockRef.current = false;
        setSavingPlatform('');
      }
    }
  };

  const previewHtml = useMemo(() => {
    if (!previewResult) return '';
    const markdown = [`# ${previewResult.titles[0]}`, previewResult.body].filter(Boolean).join('\n\n');
    return markdownRenderer.render(markdownParser.parse(markdown));
  }, [previewResult]);

  const tabItems = (output?.platforms ?? []).map((platform) => ({
    key: platform.id,
    label: platform.label,
    children: (
      <PublishPlatformResult
        platform={platform}
        copiedKey={copiedKey}
        onCopy={handleCopy}
        onPreview={setPreviewResult}
        onSave={handleSave}
        saving={savingPlatform === platform.id}
        saveDisabled={Boolean(savingPlatform)}
        saved={savedPlatforms.includes(platform.id)}
      />
    ),
  }));

  const review = output?.review;
  const footer = output ? [
    <Button key="close" disabled={Boolean(savingPlatform)} onClick={handleClose}>关闭</Button>,
    <Button
      key="regenerate"
      type="primary"
      loading={loading}
      disabled={Boolean(savingPlatform)}
      onClick={handleGenerate}
    >
      重新生成
    </Button>,
  ] : [
    <Button key="cancel" disabled={Boolean(savingPlatform)} onClick={handleClose}>取消</Button>,
    <Button key="generate" type="primary" loading={loading} onClick={handleGenerate}>
      开始生成
    </Button>,
  ];

  return (
    <>
      <Modal
        className="prepare-publish-modal"
        open={open}
        title="🚀 准备发布"
        width={860}
        onCancel={handleClose}
        footer={footer}
        closable={!savingPlatform}
        maskClosable={!loading && !savingPlatform}
      >
        {!output && (
          <div className="prepare-publish-options">
            <p>选择要生成的平台版本，多个平台会并行处理。</p>
            <Checkbox.Group
              options={PUBLISH_PLATFORM_DEFINITIONS.map(({ id, label }) => ({ label, value: id }))}
              value={selectedPlatforms}
              onChange={setSelectedPlatforms}
              disabled={loading}
            />
            <Checkbox
              checked={includeReview}
              onChange={(event) => setIncludeReview(event.target.checked)}
              disabled={loading}
            >
              生成时先做一次发布前审稿（只提醒，不阻止发布）
            </Checkbox>
          </div>
        )}

        {loading && (
          <div className="prepare-publish-loading">
            <Spin />
            <span>正在并行生成 {selectedPlatforms.length} 个平台版本…</span>
          </div>
        )}

        {output && !loading && (
          <div className="prepare-publish-output">
            {review?.error && <Alert type="warning" showIcon message="审稿未完成" description={review.error} />}
            {!review?.error && review?.warnings?.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message="发布前提醒"
                description={<ul>{review.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
              />
            )}
            {!review?.error && includeReview && review?.warnings?.length === 0 && (
              <Alert type="success" showIcon message="审稿未发现明显发布风险" />
            )}
            <Tabs items={tabItems} />
          </div>
        )}
      </Modal>

      <WechatPreviewModal
        open={Boolean(previewResult)}
        onClose={() => setPreviewResult(null)}
        sourceHtml={previewHtml}
        initialTemplateId={initialTemplateId}
        onTemplateChange={onTemplateChange}
      />
    </>
  );
}
