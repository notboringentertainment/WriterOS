import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomChannel } from '../../client/src/components/room/RoomChannel';

const props = { projectId: 'p1', characterNames: [], surfaceAwareness: { kind: 'none' as const }, locksText: '', onAdoptProposal: () => true };

function memoryResponse(status: number) {
  return vi.fn(async () => new Response(JSON.stringify({ message: 'Room memory unavailable.' }), { status }));
}

describe('RoomChannel memory unavailable', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows actionable error and disables composer only for memory 503', async () => {
    vi.stubGlobal('fetch', memoryResponse(503));
    render(<RoomChannel {...props} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/room memory unavailable/i));
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('recovery probe reopens composer', async () => {
    vi.stubGlobal('fetch', memoryResponse(503));
    render(<RoomChannel {...props} />);
    await screen.findByRole('button', { name: 'Retry' });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/messages')) return new Response(JSON.stringify({ messages: [] }), { status: 200 });
      if (url.includes('/proposals')) return new Response(JSON.stringify({ proposals: [] }), { status: 200 });
      return new Response('{}', { status: 200 });
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });
});
