// Writers' Room Phase 1 — acceptance-test seed.
// Creates the "previous session" the acceptance test requires Casey to
// reference: prior channel messages (backdated), Casey's private lane_notes /
// writer_rapport, and the standard shared blocks attached to Morgan + Casey.
//
// Usage:
//   npx tsx scripts/seedWritersRoom.ts <projectId> [characterName] [characterId]
//
// projectId     = the WriterOS project id (localStorage `writeros_active_project_id`,
//                 or visible in the Home surface URL/state).
// characterName = the lead character Casey remembers (default "the lead").
// characterId   = the Story Bible character id, used in seeded notes (optional).
//
// Idempotent: blocks upsert; prior-session messages are only inserted when the
// channel is empty for the project.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const [projectId, characterNameArg, characterIdArg] = process.argv.slice(2);
if (!projectId) {
  console.error('Usage: npx tsx scripts/seedWritersRoom.ts <projectId> [characterName] [characterId]');
  process.exit(1);
}
const characterName = characterNameArg || 'the lead';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('FAIL: SUPABASE_URL / SUPABASE_ANON_KEY not set');
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const DAYS = 24 * 60 * 60 * 1000;
const previousSession = new Date(Date.now() - 2 * DAYS);
const at = (minutesIn: number) => new Date(previousSession.getTime() + minutesIn * 60_000).toISOString();

async function upsertBlock(input: {
  agentId: string | null;
  label: string;
  value: string;
  charCap: number;
  updatedBy: string;
}): Promise<string> {
  const lookup = await db
    .from('memory_blocks')
    .select('id')
    .eq('project_id', projectId)
    .eq('label', input.label)
    [input.agentId === null ? 'is' : 'eq']('agent_id', input.agentId)
    .limit(1);
  if (lookup.error) throw new Error(lookup.error.message);
  const existing = (lookup.data ?? [])[0] as { id: string } | undefined;

  if (existing) {
    const res = await db
      .from('memory_blocks')
      .update({ value: input.value, updated_by: input.updatedBy, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (res.error) throw new Error(res.error.message);
    return existing.id;
  }
  const res = await db
    .from('memory_blocks')
    .insert({
      project_id: projectId,
      agent_id: input.agentId,
      label: input.label,
      value: input.value,
      char_cap: input.charCap,
      updated_by: input.updatedBy,
    })
    .select('id')
    .single();
  if (res.error) throw new Error(res.error.message);
  return (res.data as { id: string }).id;
}

async function main() {
  const characterRef = characterIdArg ? `${characterName} (characters[${characterIdArg}])` : characterName;

  // --- shared blocks (§4.1 standard set) + attachments for Morgan + Casey ---
  const sharedBlocks: Array<{ label: string; value: string; charCap: number }> = [
    {
      label: 'project_state',
      value:
        `Where we are: character work on ${characterName}. Last session dug into ` +
        `${characterName}'s want/need split — want is external and concrete, need is the wound underneath. ` +
        'Open thread: whether the stated want actually collides with the need by the midpoint, or just runs parallel to it.',
      charCap: 2000,
    },
    {
      label: 'open_questions',
      value:
        `1. Does ${characterName}'s want force scenes where the need gets exposed, or can they win the want without touching the wound?\n` +
        `2. Who in the cast pressures ${characterName}'s contradiction hardest — and do they have enough page time?`,
      charCap: 2000,
    },
    { label: 'story_locks', value: '', charCap: 2000 },
    { label: 'concept_seed', value: '', charCap: 4000 },
  ];

  for (const block of sharedBlocks) {
    const blockId = await upsertBlock({ agentId: null, ...block, updatedBy: 'writer' });
    for (const agentId of ['writingPartner', 'casey']) {
      const res = await db
        .from('block_attachments')
        .upsert({ block_id: blockId, agent_id: agentId }, { onConflict: 'block_id,agent_id' });
      if (res.error) throw new Error(res.error.message);
    }
    console.log(`shared block ok: ${block.label}`);
  }

  // --- Casey's private memory: the "previous session" she must reference ---
  await upsertBlock({
    agentId: 'casey',
    label: 'lane_notes',
    value:
      `PREVIOUS SESSION (${previousSession.toDateString()}): deep-dive on ${characterRef}.\n` +
      `- Writer described ${characterName}'s want as still negotiable — we tested two versions out loud.\n` +
      `- My read: the want as written is a surface goal; the need underneath is about being seen/forgiven, and the writer lit up when we hit that.\n` +
      `- Flag I'm carrying: if the want changes, check it against the need — the wound only works if the want keeps dragging ${characterName} back toward the person/place that caused it.\n` +
      `- Contradiction watch: page behavior vs stated spine. Nothing contradicts yet; re-check after the next character pass.`,
    charCap: 4000,
    updatedBy: 'casey',
  });
  console.log('casey lane_notes ok');

  await upsertBlock({
    agentId: 'casey',
    label: 'writer_rapport',
    value:
      'Ben works fast and hates hollow validation — engage with the actual text, quote it back, be specific. ' +
      'He responds best to one sharp psychological question over a list of notes. ' +
      'When he changes a core character field mid-session, it usually means he has been chewing on it since last time — treat it as intentional, not accidental.',
    charCap: 1500,
    updatedBy: 'casey',
  });
  console.log('casey writer_rapport ok');

  // --- previous-session channel history (backdated ~2 days) ---
  const existing = await db.from('room_messages').select('id').eq('project_id', projectId).limit(1);
  if (existing.error) throw new Error(existing.error.message);
  if ((existing.data ?? []).length > 0) {
    console.log('channel already has messages — skipping prior-session transcript');
  } else {
    const transcript = [
      { minutesIn: 0, author: 'writer', content: `Let's talk about ${characterName}. I keep going back and forth on what they actually want.` },
      { minutesIn: 2, author: 'writingPartner', content: `Good place to push. Casey, this is your lane — what's the read on ${characterName}'s spine?` },
      { minutesIn: 4, author: 'casey', content: `The want you have now is a surface goal — winnable without ${characterName} ever touching the real wound. The need underneath reads as being seen and forgiven. If the want doesn't keep dragging them back toward what caused that wound, the two tracks never collide and the midpoint goes soft. I'd keep the want negotiable for now, but whatever it becomes, it has to point AT the wound, not away from it.` },
      { minutesIn: 6, author: 'writer', content: `That's the tension I feel. I'll sit with it and take another pass at the want field.` },
      { minutesIn: 7, author: 'casey', content: `Noting it. When you change that field, I'll check the new want against the need and flag it if they stop colliding.` },
    ];
    for (const msg of transcript) {
      const res = await db.from('room_messages').insert({
        project_id: projectId,
        author: msg.author,
        kind: 'say',
        content: msg.content,
        created_at: at(msg.minutesIn),
      });
      if (res.error) throw new Error(res.error.message);
    }
    console.log(`prior-session transcript ok (${transcript.length} messages, dated ${previousSession.toDateString()})`);
  }

  console.log('\nSEED COMPLETE for project', projectId);
  console.log(`Casey now remembers a previous session about ${characterName}.`);
}

main().catch((err) => {
  console.error('SEED FAILED:', err);
  process.exit(1);
});
