export interface StatsSnapshot {
  totalCopies: number;
  totalPastes: number;
  sessionCopies: number;
  sessionPastes: number;
  sessionStartedAt: number;
  lastAppStart: number;
  savedEntriesCount: number;
  savedEntriesBytes: number;
  dbFileBytes: number;
  pinnedCount: number;
  snippetCount: number;
}
