import { useState } from 'react';
import { Input, Tooltip } from 'antd';
import { Link2, Unlink } from 'lucide-react';
import { beatsOfScene, unplacedBeats } from '../../../../shared/script/scriptBeats.js';
import ScriptPanelSection from './ScriptPanelSection.jsx';

const ICON_SIZE = 13;

const describeBeat = (beat) => [
  beat.scenes.length ? `第 ${beat.scenes.join('、')} 场` : '未归位',
  beat.actTitle,
].filter(Boolean).join(' · ');

/** 输入框：回车提交并清空 */
function BeatInput({ placeholder, disabled, onSubmit }) {
  const [value, setValue] = useState('');
  const handleSubmit = () => {
    const title = value.trim();
    if (!title) return;
    onSubmit(title);
    setValue('');
  };
  return (
    <Input
      size="small"
      className="script-beat-input"
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onChange={(event) => setValue(event.target.value)}
      onPressEnter={handleSubmit}
    />
  );
}

function BeatRow({ beat, sceneNumber, readOnly, onJump, onToggle }) {
  const linked = sceneNumber ? beat.scenes.includes(sceneNumber) : false;
  const tip = linked ? `从第 ${sceneNumber} 场取下` : `挂到第 ${sceneNumber} 场`;
  return (
    <li className="script-panel-row">
      <button type="button" className="script-panel-main" onClick={() => onJump(beat.id)} title="在正文里定位这个节拍">
        <strong>{beat.title}</strong>
        <span>{describeBeat(beat)}</span>
      </button>
      {sceneNumber && !readOnly && (
        <Tooltip title={tip}>
          <button
            type="button"
            className={`script-card-link${linked ? ' is-linked' : ''}`}
            onClick={() => onToggle(beat.id)}
            aria-label={tip}
          >
            {linked ? <Unlink size={ICON_SIZE} /> : <Link2 size={ICON_SIZE} />}
          </button>
        </Tooltip>
      )}
    </li>
  );
}

function BeatList({ beats, empty, ...rowProps }) {
  if (!beats.length) return <p className="script-panel-empty">{empty}</p>;
  return (
    <ul className="script-panel-list">
      {beats.map((beat) => <BeatRow key={beat.id} beat={beat} {...rowProps} />)}
    </ul>
  );
}

/**
 * 「节拍」页：写正文时看这一场要完成的剧情任务。
 * 本场节拍 → 按幕排的全部节拍（已归位）→ 还没归位的灵感。
 */
export default function ScriptBeatTab({ script }) {
  const { beats, currentScene, readOnly } = script;
  const sceneNumber = currentScene?.number ?? null;
  const rowProps = { sceneNumber, readOnly, onJump: script.onJump, onToggle: script.onToggleBeatScene };
  const placedActs = beats.acts
    .map((act) => ({ ...act, beats: act.beats.filter((beat) => beat.scenes.length) }))
    .filter((act) => act.beats.length);
  const ideas = unplacedBeats(beats.beats);

  return (
    <>
      <ScriptPanelSection title={currentScene ? `本场 · 第 ${sceneNumber} 场 ${currentScene.location}` : '本场'}>
        {currentScene ? (
          <BeatList beats={beatsOfScene(beats.beats, sceneNumber)} empty="这场还没有挂节拍" {...rowProps} />
        ) : (
          <p className="script-panel-empty">把光标放进某一场，这里显示这场要完成的剧情任务</p>
        )}
        {currentScene && (
          <BeatInput placeholder="给本场加节拍，回车" disabled={readOnly}
            onSubmit={(title) => script.onAddBeat(title, true)} />
        )}
      </ScriptPanelSection>

      <ScriptPanelSection title="全部节拍" count={beats.beats.length - ideas.length}>
        {placedActs.length ? placedActs.map((act) => (
          <div key={act.id ?? 'no-act'} className="script-beat-act">
            {act.title && <div className="script-beat-act-title">{act.title}</div>}
            <BeatList beats={act.beats} empty="" {...rowProps} />
          </div>
        )) : (
          <p className="script-panel-empty">还没有挂到场次的节拍。幕结构就是「节拍」区块里的小标题，如「## 第一幕」</p>
        )}
      </ScriptPanelSection>

      <ScriptPanelSection title="灵感 · 未归位" count={ideas.length}>
        <BeatList beats={ideas} empty="想到还不知道放哪的情节，先记在这" {...rowProps} />
        <BeatInput placeholder="记一条灵感，回车" disabled={readOnly}
          onSubmit={(title) => script.onAddBeat(title, false)} />
      </ScriptPanelSection>

      {!beats.exists && (
        <p className="script-panel-empty">节拍存在文档开头的「节拍」区块里，Obsidian 和其他 AI 照样能读。</p>
      )}
    </>
  );
}
