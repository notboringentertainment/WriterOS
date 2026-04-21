// =============================================================================
//  lib/bridge.js  ·  Backend Integration Layer
// -----------------------------------------------------------------------------
//  The ONLY module that touches "the outside world". The UI never calls fetch,
//  never opens a websocket — it subscribes to `eventBus` and calls methods on
//  `bridge`.
//
//  In dev: Bridge is backed by `state.mock.js` (local, synchronous, in-memory).
//  In prod: swap `MockBridge` for `WSBridge` / `RestBridge` without touching any
//           UI component. The contracts live in lib/schema.js.
// =============================================================================

(function(){
  const listeners = new Map(); // event → Set<fn>

  const eventBus = {
    on(event, fn)   { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); return () => eventBus.off(event, fn); },
    off(event, fn)  { listeners.get(event)?.delete(fn); },
    emit(event, payload) {
      (listeners.get(event) || []).forEach(fn => { try { fn(payload); } catch (e) { console.error('[eventBus]', event, e); } });
      (listeners.get('*') || []).forEach(fn => { try { fn({ event, payload }); } catch (e) {} });
    },
  };

  // --------------------------------------------------------------------------- //
  //  MockBridge — speaks the same interface a real bridge will.                  //
  //  In production, replace with a WSBridge that connects to Claude Code.        //
  // --------------------------------------------------------------------------- //
  class MockBridge {
    constructor() { this.mode = 'mock'; this.latency = 180; }

    // ---- outbound RPC-style calls ----
    async invoke(agentId, payload)        { return this._simulate('agent.invoke',      { agentId, payload }); }
    async createTask(task)                { return this._simulate('task.create',       task); }
    async assignTask(taskId, agentId)     { return this._simulate('task.assign',       { taskId, agentId }); }
    async transitionTask(taskId, to)      { return this._simulate('task.transition',   { taskId, to }); }
    async requestHandoff(from, to, summary, artifacts) {
      return this._simulate('handoff.request', { from, to, summary, artifacts });
    }
    async pinMemory(entry)                { return this._simulate('memory.pin',        entry); }

    _simulate(kind, payload) {
      return new Promise(resolve => {
        setTimeout(() => {
          // In real impl this returns server-confirmed data. Mock just echoes.
          eventBus.emit('notification', { kind: 'rpc', label: kind, ok: true });
          resolve({ ok: true, kind, payload });
        }, this.latency);
      });
    }

    // ---- inbound stream, normally ws-pushed ----
    // (MockState will call eventBus.emit directly; nothing needed here.)
  }

  window.WOS = window.WOS || {};
  window.WOS.eventBus = eventBus;
  window.WOS.bridge = new MockBridge();
})();
