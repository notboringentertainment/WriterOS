// Writers' Room — SSE hub. One channel stream per open project; the scheduler
// treats "project open" as "has a live SSE connection" (DECISIONS.md D11).

import type { Response } from 'express';
import type { RoomSseEvent } from './types';

const clients = new Map<string, Set<Response>>();

export function addSseClient(projectId: string, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  let set = clients.get(projectId);
  if (!set) {
    set = new Set();
    clients.set(projectId, set);
  }
  set.add(res);

  // Keep intermediaries from closing the idle stream.
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    set!.delete(res);
    if (set!.size === 0) clients.delete(projectId);
  });
}

export function broadcast(projectId: string, event: RoomSseEvent): void {
  const set = clients.get(projectId);
  if (!set) return;
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try {
      res.write(frame);
    } catch (error) {
      console.error('[room.sseHub] broadcast write failed:', error);
    }
  }
}

export function openProjectIds(): string[] {
  return [...clients.keys()];
}
