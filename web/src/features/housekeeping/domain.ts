export type HousekeepingTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'READY_FOR_INSPECTION' | 'COMPLETED';
export type HousekeepingAction = 'START' | 'COMPLETE' | 'SUBMIT_FOR_INSPECTION' | 'INSPECTION_PASSED' | 'INSPECTION_FAILED';
export type HousekeepingRoomStatus = 'TO_CLEAN' | 'IN_PROGRESS' | 'TO_INSPECT' | 'CLEAN';

export function isRoomAssignableToGuest(room: {
  active: boolean;
  status: string;
  housekeepingStatus: string;
  technicalStatus: string;
  hasOpenHousekeepingTask: boolean;
  allowDirtyForFuture: boolean;
}) {
  if (!room.active || room.status === 'OUT_OF_SERVICE' || room.technicalStatus !== 'OPERATIONAL' || room.hasOpenHousekeepingTask) {
    return false;
  }
  if (room.status === 'DIRTY' || room.housekeepingStatus !== 'CLEAN') {
    return room.allowDirtyForFuture;
  }
  return true;
}

type Transition = {
  from: HousekeepingTaskStatus;
  to: HousekeepingTaskStatus;
  roomStatus: HousekeepingRoomStatus;
};

const transitions: Record<HousekeepingAction, Transition> = {
  START: { from: 'PENDING', to: 'IN_PROGRESS', roomStatus: 'IN_PROGRESS' },
  COMPLETE: { from: 'IN_PROGRESS', to: 'COMPLETED', roomStatus: 'CLEAN' },
  SUBMIT_FOR_INSPECTION: { from: 'IN_PROGRESS', to: 'READY_FOR_INSPECTION', roomStatus: 'TO_INSPECT' },
  INSPECTION_PASSED: { from: 'READY_FOR_INSPECTION', to: 'COMPLETED', roomStatus: 'CLEAN' },
  INSPECTION_FAILED: { from: 'READY_FOR_INSPECTION', to: 'IN_PROGRESS', roomStatus: 'IN_PROGRESS' },
};

export function housekeepingTransition(status: HousekeepingTaskStatus, action: HousekeepingAction) {
  const transition = transitions[action];
  return transition.from === status ? transition : null;
}
