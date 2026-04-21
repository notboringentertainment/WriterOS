import { eventBus } from './eventBus.js';

class MockBridge {
  constructor() { this.mode = 'mock'; this.latency = 180; }

  async invoke(agentId, payload)    { return this._simulate('agent.invoke',    { agentId, payload }); }
  async createTask(task)            { return this._simulate('task.create',     task); }
  async assignTask(taskId, agentId) { return this._simulate('task.assign',     { taskId, agentId }); }
  async transitionTask(taskId, to)  { return this._simulate('task.transition', { taskId, to }); }
  async requestHandoff(from, to, summary, artifacts) {
    return this._simulate('handoff.request', { from, to, summary, artifacts });
  }
  async pinMemory(entry) { return this._simulate('memory.pin', entry); }

  _simulate(kind, payload) {
    return new Promise(resolve => {
      setTimeout(() => {
        eventBus.emit('notification', { kind: 'rpc', label: kind, ok: true });
        resolve({ ok: true, kind, payload });
      }, this.latency);
    });
  }
}

export const bridge = new MockBridge();
