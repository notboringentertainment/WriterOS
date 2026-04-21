const listeners = new Map();

export const eventBus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => eventBus.off(event, fn);
  },
  off(event, fn) { listeners.get(event)?.delete(fn); },
  emit(event, payload) {
    (listeners.get(event) || []).forEach(fn => { try { fn(payload); } catch (e) { console.error('[eventBus]', event, e); } });
    (listeners.get('*') || []).forEach(fn => { try { fn({ event, payload }); } catch (e) {} });
  },
};
