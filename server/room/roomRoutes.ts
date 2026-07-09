// Writers' Room — HTTP surface. Registered from server/routes.ts.
// All routes 503 when the room isn't configured so the rest of WriterOS keeps
// working without Supabase.

import type { Express, Request, Response } from 'express';
import { PERSONAS } from '../../shared/personas';
import { addSseClient, broadcast } from './sseHub';
import { startRoomScheduler } from './scheduler';
import * as store from './store';
import * as interviewRuntime from './interview/runtime';
import { isRoomConfigured } from './supabaseClient';
import type { ProposalOrigin, RoomEventKind } from './types';

const ACCEPTED_CLIENT_EVENTS: RoomEventKind[] = ['doc_field_changed', 'lock_changed', 'session_opened'];
const PROPOSAL_STATUSES = ['pending', 'adopted', 'rejected', 'superseded', 'blocked'] as const;
const MAX_WRITER_MESSAGE_CHARS = 4000;

function requireRoom(res: Response): boolean {
  if (isRoomConfigured()) return true;
  res.status(503).json({ message: 'Writers Room is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).' });
  return false;
}

const projectIdOf = (req: Request): string => String(req.params.projectId ?? '').trim();

function handleInterviewError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Failed to execute First Meeting action.';
  if (message.includes('does not belong to project')) {
    res.status(409).json({ message });
    return;
  }
  if (message.includes('exceeds maximum length')) {
    res.status(413).json({ message });
    return;
  }
  console.error('[room.routes] interview action failed:', error);
  res.status(500).json({ message });
}

export function registerRoomRoutes(app: Express): void {
  // Live channel stream. An open connection = "project is open" for idle_tick.
  app.get('/api/room/:projectId/stream', (req, res) => {
    if (!requireRoom(res)) return;
    addSseClient(projectIdOf(req), res);
  });

  app.get('/api/room/:projectId/messages', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      const parsedLimit = parseInt(String(req.query.limit ?? '50'), 10);
      const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;
      const messages = await store.listRecentMessages(projectIdOf(req), limit);
      res.json({ messages });
    } catch (error) {
      console.error('[room.routes] messages failed:', error);
      res.status(500).json({ message: 'Failed to load channel messages.' });
    }
  });

  app.get('/api/room/:projectId/proposals', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      const rawStatus = req.query.status;
      const status =
        typeof rawStatus === 'string' && (PROPOSAL_STATUSES as readonly string[]).includes(rawStatus)
          ? (rawStatus as (typeof PROPOSAL_STATUSES)[number])
          : undefined;
      const proposals = await store.listProposals(projectIdOf(req), status);
      res.json({ proposals });
    } catch (error) {
      console.error('[room.routes] proposals failed:', error);
      res.status(500).json({ message: 'Failed to load proposals.' });
    }
  });

  // Writer speaks in the channel.
  app.post('/api/room/:projectId/messages', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      const projectId = projectIdOf(req);
      const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      if (!content) {
        res.status(400).json({ message: 'content is required.' });
        return;
      }
      if (content.length > MAX_WRITER_MESSAGE_CHARS) {
        res.status(413).json({ message: `content must be ${MAX_WRITER_MESSAGE_CHARS} characters or fewer.` });
        return;
      }
      const characterNames = Array.isArray(req.body?.characterNames)
        ? (req.body.characterNames as unknown[]).filter((n): n is string => typeof n === 'string')
        : [];
      const characters = Array.isArray(req.body?.characters)
        ? (req.body.characters as unknown[]).filter(
            (c): c is Record<string, unknown> =>
              !!c && typeof c === 'object' && typeof (c as Record<string, unknown>).id === 'string',
          )
        : [];

      const message = await store.insertMessage({ projectId, author: 'writer', content });
      broadcast(projectId, { type: 'message', message });
      await store.insertEvent({
        projectId,
        kind: 'writer_message',
        payload: { content, characterNames, characters, messageId: message.id },
      });
      res.json({ message });
    } catch (error) {
      console.error('[room.routes] send failed:', error);
      res.status(500).json({ message: 'Failed to send message.' });
    }
  });

  // Client-originated events (doc_field_changed from the save path, etc — D4).
  app.post('/api/room/:projectId/events', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      const kind = String(req.body?.kind ?? '') as RoomEventKind;
      if (!ACCEPTED_CLIENT_EVENTS.includes(kind)) {
        res.status(400).json({ message: `kind must be one of ${ACCEPTED_CLIENT_EVENTS.join(', ')}.` });
        return;
      }
      const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
      const event = await store.insertEvent({ projectId: projectIdOf(req), kind, payload });
      res.json({ event });
    } catch (error) {
      console.error('[room.routes] event failed:', error);
      res.status(500).json({ message: 'Failed to record event.' });
    }
  });

  // Adopt / reject a proposal. Adoption applies the field CLIENT-side (D7);
  // this endpoint records the resolution and logs it to the channel.
  app.post('/api/room/:projectId/proposals/:id/resolve', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      const projectId = projectIdOf(req);
      const status = req.body?.status;
      if (status !== 'adopted' && status !== 'rejected') {
        res.status(400).json({ message: "status must be 'adopted' or 'rejected'." });
        return;
      }

      const opts: { resolvedValue?: string; origin?: ProposalOrigin } = {};
      if (req.body?.resolved_value !== undefined) {
        if (typeof req.body.resolved_value !== 'string') {
          res.status(400).json({ message: 'resolved_value must be a string.' });
          return;
        }
        opts.resolvedValue = req.body.resolved_value;
      }
      if (req.body?.origin !== undefined) {
        if (req.body.origin !== 'seed' && req.body.origin !== 'extrapolated' && req.body.origin !== 'invented') {
          res.status(400).json({ message: "origin must be 'seed', 'extrapolated', or 'invented'." });
          return;
        }
        opts.origin = req.body.origin;
      }

      const proposal = Object.keys(opts).length > 0
        ? await store.resolveProposal(projectId, String(req.params.id), status, opts)
        : await store.resolveProposal(projectId, String(req.params.id), status);
      if (!proposal) {
        res.status(409).json({ message: 'Proposal not pending for this project (already resolved, or wrong project).' });
        return;
      }
      const personaName = PERSONAS[proposal.agent_id]?.displayName ?? PERSONAS[proposal.agent_id]?.name ?? proposal.agent_id;
      const message = await store.insertMessage({
        projectId,
        author: 'writer',
        kind: 'system',
        content:
          status === 'adopted'
            ? `Writer adopted ${personaName}'s proposal for ${proposal.surface} → ${proposal.field_path} (provenance: agent:${proposal.agent_id})`
            : `Writer rejected ${personaName}'s proposal for ${proposal.surface} → ${proposal.field_path}`,
      });
      broadcast(projectId, { type: 'proposal', proposal });
      broadcast(projectId, { type: 'message', message });
      res.json({ proposal });
    } catch (error) {
      console.error('[room.routes] resolve failed:', error);
      res.status(500).json({ message: 'Failed to resolve proposal.' });
    }
  });

  // Writer-only sync of the story_locks shared block (§10: agents read locks,
  // never write them). The client pushes on project open and on lock edits.
  app.post('/api/room/:projectId/blocks/story-locks', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      const value = typeof req.body?.value === 'string' ? req.body.value : '';
      const written = await store.writeBlock({
        projectId: projectIdOf(req),
        agentId: null,
        label: 'story_locks',
        value: value.slice(0, 2000), // §4.1 cap; locks text is writer-owned, clip is safe
        updatedBy: 'writer',
        charCap: 2000,
      });
      if (!written.ok) {
        res.status(400).json({ message: written.reason });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('[room.routes] story-locks failed:', error);
      res.status(500).json({ message: 'Failed to update story locks block.' });
    }
  });

  // First Meeting — explicit, never auto-started (§A3-A12).
  app.get('/api/room/:projectId/interview', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      res.json(await interviewRuntime.getInterviewStatus(projectIdOf(req)));
    } catch (error) {
      console.error('[room.routes] interview status failed:', error);
      res.status(500).json({ message: 'Failed to load First Meeting status.' });
    }
  });

  app.post('/api/room/:projectId/interview/start', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      const mode = req.body?.mode === 'quick' ? 'quick' : req.body?.mode === 'full' ? 'full' : null;
      const seedText = typeof req.body?.seedText === 'string' ? req.body.seedText.trim() : '';
      if (!mode) {
        res.status(400).json({ message: "mode must be 'quick' or 'full'." });
        return;
      }
      if (!seedText) {
        res.status(400).json({ message: 'seedText is required.' });
        return;
      }
      const result = await interviewRuntime.startInterview({
        projectId: projectIdOf(req),
        mode,
        seedText,
        speculative: Boolean(req.body?.speculative),
      });
      res.json(result);
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/answer', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      const answerText = typeof req.body?.answerText === 'string' ? req.body.answerText.trim() : '';
      if (!answerText) {
        res.status(400).json({ message: 'answerText is required.' });
        return;
      }
      const origin = req.body?.origin;
      if (origin !== undefined && origin !== 'seed' && origin !== 'extrapolated') {
        res.status(400).json({ message: "origin must be 'seed' or 'extrapolated' for interview answers." });
        return;
      }
      const result = await interviewRuntime.answerInterviewQuestion({
        sessionId: String(req.params.sessionId),
        projectId: projectIdOf(req),
        answerText,
        resolvedValue: typeof req.body?.resolvedValue === 'string' ? req.body.resolvedValue : undefined,
        origin,
        rejectMapping: Boolean(req.body?.rejectMapping),
      });
      res.json(result);
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/skip', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      res.json(await interviewRuntime.skipInterviewQuestion({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req) }));
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/wrap', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      res.json({ session: await interviewRuntime.wrapInterview({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req) }) });
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/pause', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      res.json({ session: await interviewRuntime.pauseInterview({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req) }) });
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/resume', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      res.json({ session: await interviewRuntime.resumeInterview({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req) }) });
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  // Writer mutability decisions arrive from the client; keep only well-formed entries.
  function sanitizeMutability(raw: unknown): Record<string, 'locked' | 'leaning' | 'open'> {
    const result: Record<string, 'locked' | 'leaning' | 'open'> = {};
    if (!raw || typeof raw !== 'object') return result;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === 'locked' || value === 'leaning' || value === 'open') result[key] = value;
    }
    return result;
  }

  // POST because the preview is parameterized by the writer's in-flight mutability
  // choices (live re-preview while tagging in readback).
  app.post('/api/room/:projectId/interview/:sessionId/bank-preview', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      res.json({ preview: await interviewRuntime.previewBank({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req), mutability: sanitizeMutability(req.body?.mutability) }) });
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/bank', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      res.json(await interviewRuntime.bankInterview({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req), mutability: sanitizeMutability(req.body?.mutability) }));
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/export', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      res.json(await interviewRuntime.exportInterview({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req) }));
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  startRoomScheduler();
}
