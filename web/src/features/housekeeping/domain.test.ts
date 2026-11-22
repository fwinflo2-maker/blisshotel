import { describe, expect, it } from 'vitest';
import { housekeepingTransition, isRoomAssignableToGuest } from './domain';

describe('housekeeping task transitions', () => {
  it('moves a task from assignment through execution and makes the room clean on completion', () => {
    expect(housekeepingTransition('PENDING', 'START')).toMatchObject({
      to: 'IN_PROGRESS',
      roomStatus: 'IN_PROGRESS',
    });
    expect(housekeepingTransition('IN_PROGRESS', 'COMPLETE')).toMatchObject({
      to: 'COMPLETED',
      roomStatus: 'CLEAN',
    });
    expect(housekeepingTransition('IN_PROGRESS', 'SUBMIT_FOR_INSPECTION')).toMatchObject({
      to: 'READY_FOR_INSPECTION',
      roomStatus: 'TO_INSPECT',
    });
    expect(housekeepingTransition('READY_FOR_INSPECTION', 'INSPECTION_PASSED')).toMatchObject({
      to: 'COMPLETED',
      roomStatus: 'CLEAN',
    });
  });

  it('returns a failed inspection to the worker and rejects invalid state changes', () => {
    expect(housekeepingTransition('READY_FOR_INSPECTION', 'INSPECTION_FAILED')).toMatchObject({
      to: 'IN_PROGRESS',
      roomStatus: 'IN_PROGRESS',
    });
    expect(housekeepingTransition('PENDING', 'SUBMIT_FOR_INSPECTION')).toBeNull();
    expect(housekeepingTransition('COMPLETED', 'START')).toBeNull();
  });

  it('keeps a room unavailable for every booking while a housekeeping task is open', () => {
    expect(isRoomAssignableToGuest({
      active: true,
      status: 'DIRTY',
      housekeepingStatus: 'IN_PROGRESS',
      technicalStatus: 'OPERATIONAL',
      hasOpenHousekeepingTask: true,
      allowDirtyForFuture: true,
    })).toBe(false);
  });

  it('allows future reservations for dirty rooms only when no task is open', () => {
    expect(isRoomAssignableToGuest({
      active: true,
      status: 'DIRTY',
      housekeepingStatus: 'TO_CLEAN',
      technicalStatus: 'OPERATIONAL',
      hasOpenHousekeepingTask: false,
      allowDirtyForFuture: true,
    })).toBe(true);
    expect(isRoomAssignableToGuest({
      active: true,
      status: 'AVAILABLE',
      housekeepingStatus: 'CLEAN',
      technicalStatus: 'UNDER_MAINTENANCE',
      hasOpenHousekeepingTask: false,
      allowDirtyForFuture: false,
    })).toBe(false);
  });
});
