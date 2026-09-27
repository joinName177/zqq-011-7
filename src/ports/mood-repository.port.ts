import { MoodRecord, StorageRecoveryReport } from '../core/models';

export interface MoodRepositoryPort {
  getAll(): MoodRecord[];
  getLastRecoveryReport(): StorageRecoveryReport;
  add(record: MoodRecord): void;
  delete(id: string): void;
  resetToSample(): MoodRecord[];
}
