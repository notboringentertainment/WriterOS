#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/backfill-meeting-decisions.mjs --project-id <id> | --all');
  process.exit(2);
}

const args = process.argv.slice(2);
const all = args.includes('--all');
const projectFlag = args.indexOf('--project-id');
const projectId = projectFlag >= 0 ? args[projectFlag + 1] : null;

if ((all && projectId) || (!all && !projectId)) {
  usage('Choose exactly one scope: --project-id <id> or --all.');
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  usage('SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await db.rpc('backfill_meeting_decisions', {
  p_project_id: all ? null : projectId,
});

if (error) {
  console.error(`Meeting decision backfill failed: ${error.message}`);
  process.exit(1);
}

console.log(`Meeting decision backfill inserted ${Number(data ?? 0)} row(s).`);
