import { MoodRecord } from '../core/models';
import { RecoveryReport } from '../core/record-recovery';

export interface MoodRepositoryPort {
  getAll(): MoodRecord[];
  add(record: MoodRecord): void;
  delete(id: string): void;
  resetToSample(): MoodRecord[];
  /** 最近一次加载/写入时产生的降级恢复报告（忽略与修复原因） */
  getRecoveryReport(): RecoveryReport;
  /** 当前是否运行在 localStorage 不可用的内存降级模式（数据仅本次会话可编辑） */
  isInMemoryFallback(): boolean;
}
