// Writers' Room — HTTP surface. Registered from server/routes.ts.
// All routes 503 when the room isn't configured so the rest of WriterOS keeps
// working without Supabase.

import type { Express, Request, Response } from 'express';
import { PERSONAS } from '../../shared/personas';
import { SurfaceAwarenessSchema } from '../../shared/surfaceAwareness';
import { addSseClient, broadcast } from './sseHub';
import { startRoomScheduler } from './scheduler';
import * as store from './store';
import * as interviewRuntime from './interview/runtime';
import * as pitchPacketRuntime from './interview/pitchPacketRuntime';
import { InvalidLockSectionsError } from './lockSections';
import { isRoomConfigured } from './supabaseClient';
import { syncSurfaceLocks } from './surfaceLockSync';
import { ensureProjectMemory } from './memoryContract';
import type { ProposalOrigin, RoomEventKind } from './types';
import type { MeetingRevisionInput } from './interview/banking';

const ACCEPTED_CLIENT_EVENTS: RoomEventKind[] = ['doc_field_changed', 'lock_changed', 'session_opened'];
const PROPOSAL_STATUSES = ['pending', 'adopted', 'rejected', 'superseded', 'blocked'] as const;
const MAX_WRITER_MESSAGE_CHARS = 4000;

function requireRoom(res: Response): boolean {
  if (isRoomConfigured()) return true;
  res.status(503).json({ message: 'Writers Room is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).' });
  return false;
}

const projectIdOf = (req: Request): string => String(req.params.projectId ?? '').trim();

async function ensureMemoryOr503(req: Request, res: Response): Promise<boolean> {
  try {
    await ensureProjectMemory(projectIdOf(req));
    return true;
  } catch (error) {
    console.error('[room.routes] ensureProjectMemory failed:', error);
    res.status(503).json({ message: 'Room memory unavailable.' });
    return false;
  }
}

function handleInterviewError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Failed to execute Project Meeting action.';
  if (error instanceof InvalidLockSectionsError) {
    res.status(422).json({ message: 'Story locks contain malformed reserved section headers. Repair the lock sections before banking.' });
    return;
  }
  if (message.includes('does not belong to project') || message.includes('already in progress')) {
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

function handlePitchPacketError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Pitch Packet action failed.';
  if (error instanceof Error && error.name === 'ZodError') { res.status(400).json({ message: 'Pitch Packet data is invalid.' }); return; }
  if (message.includes('not found')) { res.status(404).json({ message }); return; }
  if (message.includes('cannot be approved') || message.includes('Only a draft') || message.includes('must be approved')) {
    res.status(422).json({ message }); return;
  }
  if (message.includes('does not belong') || message.includes('identity does not match') || message.includes('direction changed') || message.includes('requires a banked')) {
    res.status(409).json({ message }); return;
  }
  console.error('[room.routes] pitch packet action failed:', error);
  res.status(500).json({ message });
}

export function registerRoomRoutes(app: Express): void {
  // Live channel stream. An open connection = "project is open" for idle_tick.
  app.get('/api/room/:projectId/stream', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    addSseClient(projectIdOf(req), res);
  });

  app.post('/api/room/:projectId/memory/ensure', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    res.json({ ok: true });
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
    if (!(await ensureMemoryOr503(req, res))) return;
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
      const surfaceResult = SurfaceAwarenessSchema.safeParse(req.body?.surfaceAwareness);
      if (!surfaceResult.success) {
        res.status(400).json({ message: 'surfaceAwareness is required and must match current WriterOS surface state.' });
        return;
      }

      const message = await store.insertMessage({ projectId, author: 'writer', content });
      broadcast(projectId, { type: 'message', message });
      await store.insertEvent({
        projectId,
        kind: 'writer_message',
        payload: { content, characterNames, characters, surfaceAwareness: surfaceResult.data, messageId: message.id },
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
    if (!(await ensureMemoryOr503(req, res))) return;
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
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      const body = typeof req.body?.value === 'string' ? req.body.value : '';
      const outcome = await syncSurfaceLocks(projectIdOf(req), body);
      if (outcome === 'ok') { res.json({ ok: true }); return; }
      if (outcome === 'unavailable') { res.status(503).json({ message: 'Room memory unavailable.' }); return; }
      if (outcome === 'too_large') {
        res.status(413).json({ message: 'Story locks exceed the 2,000-character block cap — shorten the lock list in the editor. Nothing was saved.' });
        return;
      }
      if (outcome === 'invalid') {
        res.status(422).json({ message: 'A lock contains a reserved section header line ("## Surface-declared locks" / "## Meeting locks") — reword it. Nothing was saved.' });
        return;
      }
      res.status(409).json({ message: 'Story locks are being updated concurrently — retry the sync.' });
    } catch (error) {
      console.error('[room.routes] story-locks failed:', error);
      res.status(500).json({ message: 'Failed to update story locks block.' });
    }
  });

  // Project Meeting — explicit, never auto-started (§A3-A12).
  app.get('/api/room/:projectId/interview', async (req, res) => {
    if (!requireRoom(res)) return;
    try {
      res.json(await interviewRuntime.getInterviewStatus(projectIdOf(req)));
    } catch (error) {
      console.error('[room.routes] interview status failed:', error);
      res.status(500).json({ message: 'Failed to load Project Meeting status.' });
    }
  });

  app.post('/api/room/:projectId/interview/start', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      const mode = req.body?.mode === 'quick' ? 'quick' : req.body?.mode === 'full' ? 'full' : null;
      const seedText = typeof req.body?.seedText === 'string' ? req.body.seedText : '';
      if (!mode) {
        res.status(400).json({ message: "mode must be 'quick' or 'full'." });
        return;
      }
      if (!seedText.trim()) {
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
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      const answerText = typeof req.body?.answerText === 'string' ? req.body.answerText : '';
      if (!answerText.trim()) {
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
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json(await interviewRuntime.skipInterviewQuestion({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req) }));
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/wrap', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json({ session: await interviewRuntime.wrapInterview({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req) }) });
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/pause', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json({ session: await interviewRuntime.pauseInterview({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req) }) });
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/resume', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json({ session: await interviewRuntime.resumeInterview({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req) }) });
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/redirect', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      const area = typeof req.body?.area === 'string' ? req.body.area.trim() : '';
      const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId.trim() : '';
      if (!area || !questionId || area.length > 200 || questionId.length > 200) {
        res.status(400).json({ message: 'Choose a valid earlier-round area to ask again.' });
        return;
      }
      res.json(await interviewRuntime.redirectInterviewArea({
        sessionId: String(req.params.sessionId), projectId: projectIdOf(req), area, questionId,
      }));
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

  function sanitizeOperations(raw: unknown): MeetingRevisionInput[] {
    if (!Array.isArray(raw)) return [];
    const isText = (value: unknown, max = 20000): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
    const isMutability = (value: unknown): value is 'locked' | 'leaning' | 'open' => value === 'locked' || value === 'leaning' || value === 'open';
    return raw.flatMap((entry): MeetingRevisionInput[] => {
      if (!entry || typeof entry !== 'object') return [];
      const value = entry as Record<string, unknown>;
      if ((value.op === 'keep' || value.op === 'retract') && isText(value.targetId, 200)) {
        return [{ op: value.op, targetId: value.targetId.trim() }];
      }
      if (value.op === 'revise' && isText(value.targetId, 200) && isText(value.statement)) {
        return [{ op: 'revise', targetId: value.targetId.trim(), statement: value.statement.trim(), ...(isMutability(value.mutability) ? { mutability: value.mutability } : {}) }];
      }
      if (value.op === 'supersede' && Array.isArray(value.targetIds) && value.targetIds.length > 0
        && value.targetIds.every((id) => isText(id, 200)) && isText(value.area, 200)
        && isText(value.fieldPath, 500) && isText(value.statement) && isMutability(value.mutability)) {
        return [{ op: 'supersede', targetIds: value.targetIds.map((id) => (id as string).trim()), area: value.area.trim(), fieldPath: value.fieldPath.trim(), statement: value.statement.trim(), mutability: value.mutability }];
      }
      return [];
    });
  }

  // POST because the preview is parameterized by the writer's in-flight mutability
  // choices (live re-preview while tagging in readback).
  app.post('/api/room/:projectId/interview/:sessionId/bank-preview', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json(await interviewRuntime.previewBankFinal({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req), mutability: sanitizeMutability(req.body?.mutability), operations: sanitizeOperations(req.body?.operations) }));
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/bank', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json(await interviewRuntime.bankInterview({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req), mutability: sanitizeMutability(req.body?.mutability), operations: sanitizeOperations(req.body?.operations) }));
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/export', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json(await interviewRuntime.exportInterview({ sessionId: String(req.params.sessionId), projectId: projectIdOf(req) }));
    } catch (error) {
      handleInterviewError(res, error);
    }
  });

  app.post('/api/room/:projectId/interview/:sessionId/pitch-packet/draft', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json(await pitchPacketRuntime.createPitchPacketDraft({
        projectId: projectIdOf(req), sessionId: String(req.params.sessionId), documents: req.body?.documents,
        projectMeta: { title: typeof req.body?.projectMeta?.title === 'string' ? req.body.projectMeta.title : undefined },
      }));
    } catch (error) { handlePitchPacketError(res, error); }
  });

  app.patch('/api/room/:projectId/interview/:sessionId/pitch-packet/:packetId', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json(await pitchPacketRuntime.savePitchPacketDraft({
        projectId: projectIdOf(req), sessionId: String(req.params.sessionId), packetId: String(req.params.packetId), packet: req.body?.packet,
      }));
    } catch (error) { handlePitchPacketError(res, error); }
  });

  app.post('/api/room/:projectId/interview/:sessionId/pitch-packet/:packetId/approve', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json(await pitchPacketRuntime.approvePitchPacket({ projectId: projectIdOf(req), sessionId: String(req.params.sessionId), packetId: String(req.params.packetId) }));
    } catch (error) { handlePitchPacketError(res, error); }
  });

  app.post('/api/room/:projectId/interview/:sessionId/pitch-packet/:packetId/export', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      res.json(await pitchPacketRuntime.exportPitchPacket({ projectId: projectIdOf(req), sessionId: String(req.params.sessionId), packetId: String(req.params.packetId) }));
    } catch (error) { handlePitchPacketError(res, error); }
  });

  app.get('/api/room/:projectId/interview/:sessionId/pitch-packet/exported', async (req, res) => {
    if (!requireRoom(res)) return;
    if (!(await ensureMemoryOr503(req, res))) return;
    try {
      const row = await pitchPacketRuntime.getExportedPitchPacket({ projectId: projectIdOf(req), sessionId: String(req.params.sessionId) });
      if (!row) { res.status(404).json({ message: 'No exported Pitch Packet exists for this Meeting round.' }); return; }
      res.json(row);
    } catch (error) { handlePitchPacketError(res, error); }
  });

  startRoomScheduler();
}
