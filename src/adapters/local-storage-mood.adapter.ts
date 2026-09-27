import { MoodRecord } from '../core/models';
import { MoodRepositoryPort } from '../ports/mood-repository.port';
import { createRecordFromTag } from '../core/meteorology-engine';
import { RecoveryReport, emptyRecoveryReport, recoverRecords } from '../core/record-recovery';

const STORAGE_KEY = 'mood_meteorology_records_v1';
const QUARANTINE_PREFIX = 'mood_meteorology_records_quarantine_';
const QUARANTINE_KEEP = 3;

export class LocalStorageMoodAdapter implements MoodRepositoryPort {
  private records: MoodRecord[] = [];
  private report: RecoveryReport = emptyRecoveryReport();
  private storageAvailable = false;

  constructor() {
    this.storageAvailable = this.probeStorage();
    this.load();
  }

  // ---- 对外契约 ----

  getAll(): MoodRecord[] {
    return this.records.slice();
  }

  add(record: MoodRecord): void {
    // remove existing for same date if any
    this.records = this.records.filter(r => r.date !== record.date);
    this.records.push(record);
    this.persist('保存');
  }

  delete(id: string): void {
    this.records = this.records.filter(r => r.id !== id);
    this.persist('删除');
  }

  resetToSample(): MoodRecord[] {
    this.records = this.buildSampleRecords();
    this.report = emptyRecoveryReport();
    this.persist('重置为示例序列');
    return this.getAll();
  }

  getRecoveryReport(): RecoveryReport {
    return this.report;
  }

  isInMemoryFallback(): boolean {
    return !this.storageAvailable;
  }

  // ---- 加载与降级恢复 ----

  private probeStorage(): boolean {
    try {
      const probe = '__mood_storage_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  private load(): void {
    // 浏览器禁用 localStorage（隐私模式/安全策略）：降级到内存，档案仍可继续编辑
    if (!this.storageAvailable) {
      this.records = this.buildSampleRecords();
      this.report = {
        ...emptyRecoveryReport(),
        keptCount: this.records.length,
        storageNotices: [
          '浏览器本地存储当前不可用（隐私模式或被安全策略禁用），已降级为内存模式：你仍可正常记录与编辑，但数据仅保存在本次会话中，刷新页面后会恢复为示例数据。'
        ]
      };
      return;
    }

    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      this.records = [];
      this.report = {
        ...emptyRecoveryReport(),
        storageNotices: [
          `读取本地存储时被浏览器拒绝（${this.describeError(err)}），本次以空档案启动，现有数据未被改动。`
        ]
      };
      return;
    }

    // 键不存在 = 首次使用，载入示例引导
    if (raw === null) {
      this.records = this.buildSampleRecords();
      this.report = emptyRecoveryReport();
      this.persist('初始化示例数据');
      return;
    }

    // 空白字符串视为损坏
    if (raw.trim() === '') {
      this.records = [];
      this.report = {
        ...emptyRecoveryReport(),
        storageNotices: ['本地存储中的情绪档案为空文本，已按空档案处理；可以直接记录新的心情天气。']
      };
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // 整体损坏：绝不静默重置覆盖用户数据，隔离原文后从空档案开始
      const backupKey = this.quarantine(raw);
      this.records = [];
      this.report = {
        ...emptyRecoveryReport(),
        storageNotices: [
          `本地存储中的情绪档案已整体损坏、无法解析（${this.describeError(err)}），因此整份旧档案未被载入统计。损坏原文已隔离备份到本地存储键「${backupKey}」以便手工找回，当前从空档案开始，你可以继续记录，旧数据不会被覆盖丢失。`
        ]
      };
      return;
    }

    if (!Array.isArray(parsed)) {
      const backupKey = this.quarantine(raw);
      this.records = [];
      this.report = {
        ...emptyRecoveryReport(),
        storageNotices: [
          `本地存储中的情绪档案根结构不是记录数组（实际为 ${this.typeName(parsed)}），已整体忽略；原文已隔离备份到「${backupKey}」，当前从空档案开始。`
        ]
      };
      return;
    }

    // 按记录降级：合法保留 / 字段缺失修复 / 关键字段非法忽略
    const { records, report } = recoverRecords(parsed);
    this.records = records;

    if (report.ignoredCount > 0 || report.repairedCount > 0) {
      // 自愈：把净化后的数据安全回写；先把原始整段文本隔离留证
      const backupKey = this.quarantine(raw);
      report.storageNotices = [
        `读取档案时共 ${parsed.length} 条记录：完整保留 ${report.keptCount} 条，自动修复 ${report.repairedCount} 条，整条忽略 ${report.ignoredCount} 条。被忽略的记录未参与任何统计，原因见下方明细。含问题的原始数据已隔离备份到「${backupKey}」，并已用净化后的安全数据自动回写。`
      ];
      this.report = report;
      this.persist('修复后回写净化数据');
    } else {
      this.report = report;
    }
  }

  // ---- 持久化（含配额/失效降级） ----

  private persist(action: string): void {
    if (!this.storageAvailable) {
      this.pushNoticeOnce(
        `当前处于内存降级模式，${action}结果仅保存在本次会话中，刷新页面后不会保留；请退出隐私模式或放开本地存储权限后再使用。`
      );
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch (err) {
      // 配额已满或存储被中途关闭：内存中的编辑仍然有效，可继续操作
      this.storageAvailable = false;
      this.report = {
        ...this.report,
        storageNotices: [
          ...this.report.storageNotices,
          `写入本地存储失败（${this.describeError(err)}，通常是存储空间已满）。${action}已保存在当前会话内存中，你可以继续编辑，但刷新页面后该改动会丢失；可尝试重置示例序列释放空间。`
        ]
      };
    }
  }

  private pushNoticeOnce(notice: string): void {
    if (!this.report.storageNotices.includes(notice)) {
      this.report = { ...this.report, storageNotices: [...this.report.storageNotices, notice] };
    }
  }

  // ---- 损坏原文隔离（保留最近若干份现场，不覆盖历史备份） ----

  private quarantine(rawText: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `${QUARANTINE_PREFIX}${stamp}`;
    try {
      localStorage.setItem(key, rawText);
      const backups = this.listQuarantineKeys().sort();
      backups.slice(0, Math.max(0, backups.length - QUARANTINE_KEEP)).forEach(k => {
        try {
          localStorage.removeItem(k);
        } catch {
          // 清理旧备份失败可忽略
        }
      });
      return key;
    } catch {
      return `${key}（备份写入失败，存储可能已满；损坏数据仍保留在原存储键中未被覆盖）`;
    }
  }

  private listQuarantineKeys(): string[] {
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(QUARANTINE_PREFIX)) keys.push(k);
      }
    } catch {
      // 无法枚举时跳过清理
    }
    return keys;
  }

  // ---- 示例数据 ----

  private buildSampleRecords(): MoodRecord[] {
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
    return sampleSequence.map(item => {
      const d = new Date(now.getTime() - item.daysAgo * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      return createRecordFromTag(item.tag, item.intensity, item.note, dateStr);
    });
  }

  // ---- 小工具 ----

  private describeError(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    return String(err);
  }

  private typeName(v: unknown): string {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }
}
