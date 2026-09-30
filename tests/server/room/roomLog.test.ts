import { afterEach, describe, expect, it, vi } from 'vitest';
import { roomError, roomWarn } from '../../../server/room/roomLog';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /;

describe('roomLog', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prefixes error lines with an ISO timestamp and keeps the message greppable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    roomError('[room.scheduler] tick failed:', err);
    expect(spy).toHaveBeenCalledTimes(1);
    const [line, passed] = spy.mock.calls[0];
    expect(line).toMatch(ISO);
    expect(line).toContain('[room.scheduler] tick failed:');
    expect(passed).toBe(err);
  });

  it('does the same for warnings', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    roomWarn('[room.lockGate] check failed:', 'x');
    expect(spy.mock.calls[0][0]).toMatch(ISO);
  });
});
