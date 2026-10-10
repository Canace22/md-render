import { describe, expect, it } from 'vitest';
import {
  createSession,
  MAX_PERSISTED_SESSIONS,
  restoreAgentSessions,
  serializeAgentSessions,
} from '../renderer/src/core/agent/sessionUtils.js';

const roundTrip = (sessions, activeId) => restoreAgentSessions(
  JSON.parse(JSON.stringify(serializeAgentSessions(sessions, activeId))),
);

describe('agent 会话持久化', () => {
  it('消息、历史和产出物卡片能完整恢复，并保持当前会话', () => {
    const a = { ...createSession('A'), messages: [{ role: 'user', text: '你好' }], history: [{ role: 'user', content: '你好' }] };
    const artifact = { role: 'tool', callId: 'c1', label: '生成方案', status: 'done', result: '{"kind":"agent_artifact","fileId":"f1"}' };
    const b = { ...createSession('B'), messages: [artifact] };
    const { agentSessions, activeAgentSessionId } = roundTrip([a, b], b.id);
    expect(agentSessions.map((s) => s.title)).toEqual(['A', 'B']);
    expect(agentSessions[0].history).toEqual(a.history);
    expect(agentSessions[1].messages[0]).toEqual(artifact);
    expect(activeAgentSessionId).toBe(b.id);
  });

  it('上次没跑完的消息收口：打字中→已停止，运行中工具→中断，重试参数不落盘', () => {
    const s = {
      ...createSession(),
      messages: [
        { role: 'assistant', text: '写到一半', typing: true, streamId: 'x' },
        { role: 'tool', callId: 'c', label: '读文档', status: 'running' },
        { role: 'assistant', text: '出错了', error: true, retry: { promptText: '很长的正文' } },
      ],
    };
    const [restored] = roundTrip([s], s.id).agentSessions;
    expect(restored.messages[0]).toMatchObject({ typing: false, stopped: true });
    expect(restored.messages[1].status).toBe('interrupted');
    expect(restored.messages[2]).not.toHaveProperty('retry');
  });

  it('只保留最近的若干个会话', () => {
    const many = Array.from({ length: MAX_PERSISTED_SESSIONS + 5 }, (_v, i) => createSession(`S${i}`));
    const { sessions } = serializeAgentSessions(many, many[0].id);
    expect(sessions).toHaveLength(MAX_PERSISTED_SESSIONS);
    expect(sessions[0].title).toBe('S0');
  });

  it('空数据或损坏数据给一个新会话', () => {
    for (const bad of [null, undefined, {}, { sessions: 'x' }, { sessions: [null, { id: 1 }] }]) {
      const { agentSessions, activeAgentSessionId } = restoreAgentSessions(bad);
      expect(agentSessions).toHaveLength(1);
      expect(activeAgentSessionId).toBe(agentSessions[0].id);
    }
  });

  it('activeId 指向已删除的会话时回落到第一个', () => {
    const s = createSession();
    expect(roundTrip([s], 'gone').activeAgentSessionId).toBe(s.id);
  });

  it('旧数据缺字段时补默认值', () => {
    const { agentSessions } = restoreAgentSessions({ sessions: [{ id: 'old', messages: [] }] });
    expect(agentSessions[0]).toMatchObject({ id: 'old', title: '新会话', history: [], externalSessionId: '' });
  });
});
