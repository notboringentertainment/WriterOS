// Writers' Room — live speak() streaming (§6.3, D10).
// The channel message is the speak tool's `content` argument, which arrives as
// input_json_delta fragments. This module accumulates the partial JSON for the
// active speak block and extracts the decoded prefix of the content string, so
// the UI can render real deltas — the typing indicator is real, not theater.

// Decode the longest complete prefix of the JSON string value of `content`
// from a partial JSON document like: {"content": "Hel...
// Returns null until the content key's opening quote has arrived.
export function extractSpeakContentPrefix(partialJson: string): string | null {
  const keyMatch = /"content"\s*:\s*"/.exec(partialJson);
  if (!keyMatch) return null;

  let out = '';
  let i = keyMatch.index + keyMatch[0].length;
  while (i < partialJson.length) {
    const ch = partialJson[i];
    if (ch === '"') break; // string closed
    if (ch === '\\') {
      const next = partialJson[i + 1];
      if (next === undefined) break; // trailing partial escape — drop it
      if (next === 'u') {
        const hex = partialJson.slice(i + 2, i + 6);
        if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) break; // incomplete \uXXXX
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f' };
      out += simple[next] ?? next;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

// Stateful tracker fed raw Anthropic stream events. Emits the full decoded
// content prefix every time it grows (the client renders the latest prefix,
// so resends are idempotent).
// Structural view of the Anthropic stream events we care about; keeps this
// module SDK-type-free so the tracker stays trivially testable.
interface SpeakStreamEvent {
  type: string;
  index?: number;
  content_block?: { type: string; name?: string };
  delta?: { type?: string; partial_json?: string };
}

export function createSpeakStreamTracker(onContent: (content: string) => void) {
  let speakBlockIndex: number | null = null;
  let partialJson = '';
  let lastEmitted = '';

  return (rawEvent: unknown) => {
    const event = rawEvent as SpeakStreamEvent;
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use' && event.content_block.name === 'speak') {
      speakBlockIndex = event.index ?? null;
      partialJson = '';
      lastEmitted = '';
      return;
    }
    if (event.type === 'content_block_delta' && event.index === speakBlockIndex && event.delta?.type === 'input_json_delta') {
      partialJson += event.delta.partial_json ?? '';
      const content = extractSpeakContentPrefix(partialJson);
      if (content !== null && content !== lastEmitted) {
        lastEmitted = content;
        onContent(content);
      }
      return;
    }
    if (event.type === 'content_block_stop' && event.index === speakBlockIndex) {
      speakBlockIndex = null;
    }
  };
}
