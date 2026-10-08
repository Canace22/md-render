import { useEffect, useMemo, useState } from 'react';
import { Modal, Tree } from 'antd';
import { buildMoveTargetTree, findNodeById } from '../store/workspaceUtils.js';

/** 右键「移动到…」：选目标文件夹（含根目录），确认后交给 onMove */
const MoveNodeModal = ({ workspace, nodeId, onMove, onClose }) => {
  const [targetId, setTargetId] = useState(null);
  const node = nodeId ? findNodeById(workspace, nodeId) : null;
  const treeData = useMemo(
    () => (nodeId ? buildMoveTargetTree(workspace, nodeId) : []),
    [workspace, nodeId],
  );

  useEffect(() => {
    setTargetId(null);
  }, [nodeId]);

  const handleOk = async () => {
    if (!targetId) return;
    await onMove(nodeId, targetId);
    onClose();
  };

  return (
    <Modal
      open={Boolean(node)}
      title={`移动「${node?.name ?? ''}」到`}
      okText="移动"
      cancelText="取消"
      okButtonProps={{ disabled: !targetId }}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnClose
    >
      <div className="move-node-tree" data-testid="move-node-tree">
        <Tree
          blockNode
          showLine
          defaultExpandedKeys={[workspace?.id]}
          treeData={treeData}
          selectedKeys={targetId ? [targetId] : []}
          onSelect={(keys) => setTargetId(keys[0] ?? null)}
        />
      </div>
    </Modal>
  );
};

export default MoveNodeModal;
