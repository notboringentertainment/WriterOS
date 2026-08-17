// Thin compatibility wrapper: every existing "receipt below the agent
// response" call site (LeftRail, RoomChannel, ProjectMeetingPage, Outline/
// Synopsis/Treatment tabs, PitchPacketReview) already renders this component.
// Task 9 upgrades the receipt itself (expandable citations, conflict
// disclosure) in client/src/components/memory/MemoryReceipt.tsx; delegating
// here means every one of those surfaces gets the upgrade without touching
// each call site individually.
import type { MemoryReceipt as MemoryReceiptData } from '@shared/schema'
import { MemoryReceipt } from '../memory/MemoryReceipt'

export function MemoryReceiptDisclosure({ receipt }: { receipt?: MemoryReceiptData }) {
  return <MemoryReceipt receipt={receipt} />
}
