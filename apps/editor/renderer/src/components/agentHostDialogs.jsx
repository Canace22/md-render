import { Modal } from 'antd';

/** AI 请求删除条目时的强制确认框：列出全部名称，用户点确认才继续 */
export const confirmAgentDelete = (names, reason) => new Promise((resolve) => {
  Modal.confirm({
    title: `AI 助手请求删除 ${names.length} 个条目`,
    content: (
      <div>
        {reason ? <p style={{ marginBottom: 8 }}>原因：{reason}</p> : null}
        <ul style={{ paddingLeft: 18, maxHeight: 200, overflow: 'auto' }}>
          {names.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}
        </ul>
        <p style={{ marginTop: 8 }}>删除后不可恢复，确认继续吗？</p>
      </div>
    ),
    okText: '确认删除',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: () => resolve(true),
    onCancel: () => resolve(false),
  });
});

/** 安全修复前的确认框 */
export const requestSafeRepairApproval = ({ title, description }) => new Promise((resolve) => {
  Modal.confirm({
    title,
    content: description,
    okText: '确认修复',
    cancelText: '取消',
    onOk: () => resolve(true),
    onCancel: () => resolve(false),
  });
});

/** app 内 AI 和外部 agent 共用的 host 交互依赖 */
export const AGENT_HOST_DIALOGS = Object.freeze({
  confirmDelete: confirmAgentDelete,
  confirmSafeRepair: requestSafeRepairApproval,
});
