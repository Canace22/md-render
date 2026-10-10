import { Button, Empty, Tooltip } from 'antd';
import { FileText, ListOrdered, Sparkles } from 'lucide-react';
import ScriptPanelSection from './ScriptPanelSection.jsx';

const ICON_SIZE = 14;

/** 点按钮不抢编辑器焦点，插入位置才是光标所在行 */
const keepEditorFocus = (event) => event.preventDefault();

const formatScenes = (numbers) => (numbers.length ? `第 ${numbers.join('、')} 场` : '未出场');

function CardLink({ cardId, label, onOpenCard }) {
  if (!cardId) return null;
  return (
    <Tooltip title={`打开「${label}」设定卡`}>
      <button type="button" className="script-card-link" onClick={() => onOpenCard(cardId)} aria-label="打开设定卡">
        <FileText size={12} />
      </button>
    </Tooltip>
  );
}

function CharacterList({ characters, cardIds, readOnly, onInsertDialogue, onOpenCard }) {
  if (!characters.length) return <p className="script-panel-empty">写「角色名：台词」后自动出现</p>;
  return (
    <ul className="script-panel-list">
      {characters.map((item) => (
        <li key={item.name} className="script-panel-row">
          <button
            type="button"
            className="script-panel-main"
            disabled={readOnly}
            onMouseDown={keepEditorFocus}
            onClick={() => onInsertDialogue(item.name)}
            title={`插入「${item.name}：」`}
          >
            <strong>{item.name}</strong>
            <span>{item.dialogueCount} 句 · {item.sceneNumbers.length} 场</span>
          </button>
          <CardLink cardId={cardIds.character(item.name)} label={item.name} onOpenCard={onOpenCard} />
        </li>
      ))}
    </ul>
  );
}

function SceneList({ scenes, onJump }) {
  if (!scenes.length) return <p className="script-panel-empty">以「1. 日 内 地点」开头的标题就是一场戏</p>;
  return (
    <ul className="script-panel-list">
      {scenes.map((scene) => (
        <li key={scene.id} className="script-panel-row">
          <button type="button" className="script-panel-main" onClick={() => onJump(scene.id)} title={scene.heading}>
            <strong>{scene.number}. {scene.location || '未写地点'}</strong>
            <span>{[scene.time, scene.space].filter(Boolean).join(' ')} · {scene.characters.join('、') || '无人物'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LocationList({ locations, cardIds, onJump, onOpenCard }) {
  if (!locations.length) return <p className="script-panel-empty">场景标题里的地点会出现在这里</p>;
  return (
    <ul className="script-panel-list">
      {locations.map((item) => (
        <li key={item.name} className="script-panel-row">
          <button type="button" className="script-panel-main" onClick={() => onJump(item.firstBlockId)}>
            <strong>{item.name}</strong>
            <span>{formatScenes(item.sceneNumbers)}</span>
          </button>
          <CardLink cardId={cardIds.location(item.name)} label={item.name} onOpenCard={onOpenCard} />
        </li>
      ))}
    </ul>
  );
}

/** 「资源」页：从正文自动解析的角色 / 场次 / 地点 */
export default function ScriptResourceTab({ script }) {
  const { analysis, cardIds, readOnly, generating } = script;
  const { scenes, characters, locations } = analysis;
  const hasResources = characters.length + locations.length > 0;

  return (
    <>
      <ScriptPanelSection
        title="角色"
        count={characters.length}
        action={(
          <Tooltip title="给还没有设定卡的角色、地点各建一篇文档（剧本同目录）">
            <Button size="small" type="text" icon={<Sparkles size={ICON_SIZE} />}
              loading={generating} disabled={readOnly || !hasResources} onClick={script.onGenerateCards}>
              生成设定卡
            </Button>
          </Tooltip>
        )}
      >
        <CharacterList characters={characters} cardIds={cardIds} readOnly={readOnly}
          onInsertDialogue={script.onInsertDialogue} onOpenCard={script.onOpenCard} />
      </ScriptPanelSection>

      <ScriptPanelSection
        title="场次"
        count={scenes.length}
        action={scenes.length > 1 && (
          <Tooltip title="按正文顺序重排场次号，节拍里引用的场次跟着改">
            <Button size="small" type="text" icon={<ListOrdered size={ICON_SIZE} />}
              disabled={readOnly} onClick={script.onRenumber} aria-label="重新编号" />
          </Tooltip>
        )}
      >
        <SceneList scenes={scenes} onJump={script.onJump} />
      </ScriptPanelSection>

      <ScriptPanelSection title="地点" count={locations.length}>
        <LocationList locations={locations} cardIds={cardIds} onJump={script.onJump} onOpenCard={script.onOpenCard} />
      </ScriptPanelSection>

      {!scenes.length && !characters.length && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="开始写第一场戏吧" />
      )}
    </>
  );
}
