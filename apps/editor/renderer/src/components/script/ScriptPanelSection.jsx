/** 剧本栏里的一个分组：标题 + 数量 + 右侧动作 */
export default function ScriptPanelSection({ title, count, action, children }) {
  return (
    <section className="script-panel-section">
      <header className="script-panel-section-head">
        <span>{title}{count !== undefined && <em>{count}</em>}</span>
        {action}
      </header>
      {children}
    </section>
  );
}
