import { MoodRecord } from '../core/models';

export interface MoodRepositoryPort {
  getAll(): MoodRecord[];
  add(record: MoodRecord): void;
  delete(id: string): void;
  resetToSample(): MoodRecord[];
}
