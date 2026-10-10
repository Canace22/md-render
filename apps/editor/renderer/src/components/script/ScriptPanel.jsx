import { useState } from 'react';
import { Button, Segmented } from 'antd';
import { Clapperboard, Triangle } from 'lucide-react';
import ScriptBeatTab from './ScriptBeatTab.jsx';
import ScriptResourceTab from './ScriptResourceTab.jsx';

const ICON_SIZE = 14;
const TAB_BEATS = 'beats';
const TAB_RESOURCES = 'resources';
const TAB_OPTIONS = [
  { value: TAB_BEATS, label: '节拍' },
  { value: TAB_RESOURCES, label: '资源' },
];

/** 点按钮不抢编辑器焦点，插入位置才是光标所在行 */
const keepEditorFocus = (event) => event.preventDefault();

/**
 * 剧本页右侧工作栏：快捷插入 + 「节拍」「资源」两页。
 * 纯展示，数据和动作都来自 useScriptPage。
 */
export default function ScriptPanel({ script }) {
  const [tab, setTab] = useState(TAB_BEATS);
  if (!script.analysis || !script.beats) return null;
  const { readOnly } = script;

  return (
    <aside className="script-panel" aria-label="剧本工作栏" data-testid="script-panel">
      <div className="script-panel-tabs">
        <Segmented block size="small" value={tab} options={TAB_OPTIONS} onChange={setTab} />
      </div>
      <div className="script-panel-actions">
        <Button size="small" icon={<Clapperboard size={ICON_SIZE} />} disabled={readOnly}
          onMouseDown={keepEditorFocus} onClick={script.onInsertScene}>场景</Button>
        <Button size="small" icon={<Triangle size={ICON_SIZE} />} disabled={readOnly}
          onMouseDown={keepEditorFocus} onClick={script.onInsertAction}>动作</Button>
      </div>
      <p className="script-panel-hint">空行按 <kbd>Tab</kbd> 在 △动作 和各角色对白间切换；点角色名直接插入对白。</p>

      <div className="script-panel-body">
        {tab === TAB_BEATS ? <ScriptBeatTab script={script} /> : <ScriptResourceTab script={script} />}
      </div>
    </aside>
  );
}
