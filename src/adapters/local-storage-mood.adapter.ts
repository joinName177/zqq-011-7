import { MoodRecord } from '../core/models';
import { MoodRepositoryPort } from '../ports/mood-repository.port';
import { createRecordFromTag } from '../core/meteorology-engine';

const STORAGE_KEY = 'mood_meteorology_records_v1';

export class LocalStorageMoodAdapter implements MoodRepositoryPort {
  getAll(): MoodRecord[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return this.resetToSample();
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // ignore
    }
    return this.resetToSample();
  }

  add(record: MoodRecord): void {
    const records = this.getAll();
    // remove existing for same date if any
    const filtered = records.filter(r => r.date !== record.date);
    filtered.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  delete(id: string): void {
    const records = this.getAll().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  resetToSample(): MoodRecord[] {
    const sampleSequence: { tag: string; intensity: number; note: string; daysAgo: number }[] = [
      { tag: '晴空万里', intensity: 8, note: '项目顺利交付，周末在公园草坪晒太阳看书', daysAgo: 13 },
      { tag: '微风煦暖', intensity: 7, note: '和久违的老朋友喝咖啡，聊得很尽兴', daysAgo: 12 },
      { tag: '阴转多云', intensity: 5, note: '周一早会任务排得很满，平平淡淡地推进中', daysAgo: 11 },
      { tag: '暖湿气流过境', intensity: 6, note: '收到远方朋友的明信片与礼物，心里暖融融的', daysAgo: 10 },
      { tag: '低气压大雾', intensity: 4, note: '下雨天有点没精神，工作效率稍显迟缓', daysAgo: 9 },
      { tag: '局部有焦虑', intensity: 7, note: '季度目标对齐会议，几个指标有点卡住', daysAgo: 8 },
      { tag: '局部有焦虑', intensity: 8, note: '晚上失眠胡思乱想，担心后续进展', daysAgo: 7 },
      { tag: '突发雷暴', intensity: 9, note: '需求突然变更被要求大改，情绪瞬间崩溃爆发', daysAgo: 6 },
      { tag: '暖湿气流过境', intensity: 6, note: '同组成员主动分担了工作，并送了奶茶安慰', daysAgo: 5 },
      { tag: '阴转多云', intensity: 5, note: '调整心态，逐步把阻塞的问题拆解解决', daysAgo: 4 },
      { tag: '微风煦暖', intensity: 7, note: '晚风很舒服，去河边慢跑了5公里出了一身汗', daysAgo: 3 },
      { tag: '晴空万里', intensity: 8, note: '所有模块测试通过，终于可以松一口气', daysAgo: 2 },
      { tag: '微风煦暖', intensity: 7, note: '睡到自然醒，给阳台的多肉植物浇水修叶', daysAgo: 1 },
      { tag: '局部有焦虑', intensity: 7, note: '新的一周即将到来，局部依然盘旋着对未知的轻度担忧', daysAgo: 0 }
    ];

    const now = new Date();
    const records: MoodRecord[] = sampleSequence.map(item => {
      const d = new Date(now.getTime() - item.daysAgo * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      return createRecordFromTag(item.tag, item.intensity, item.note, dateStr);
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return records;
  }
}
