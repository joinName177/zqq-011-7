import { MoodRecord, RecordRecoveryEntry, StorageRecoveryReport } from './models';
import { deriveMeteorologyFields, DerivedMeteorology } from './meteorology-engine';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TAG = '阴转多云';
const DEFAULT_INTENSITY = 5;
const DEFAULT_NOTE = '平静观测记录';

interface DerivedFieldRule {
  key: 'pressureHpa' | 'temperatureC' | 'humidityPercent' | 'windSpeedKmH' | 'windDirectionDeg';
  label: string;
  min: number;
  max: number;
}

// 气象观测字段的合理量程：超出即视为损坏，按标签与强度整体重算
const DERIVED_FIELD_RULES: DerivedFieldRule[] = [
  { key: 'pressureHpa', label: '气压', min: 900, max: 1100 },
  { key: 'temperatureC', label: '温度', min: -80, max: 60 },
  { key: 'humidityPercent', label: '湿度', min: 0, max: 100 },
  { key: 'windSpeedKmH', label: '风速', min: 0, max: 300 },
  { key: 'windDirectionDeg', label: '风向角度', min: 0, max: 360 }
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidDate(date: string): boolean {
  return DATE_RE.test(date) && !Number.isNaN(new Date(`${date}T00:00:00`).getTime());
}

export function createOkReport(totalStored = 0): StorageRecoveryReport {
  return {
    status: 'ok',
    totalStored,
    keptCount: totalStored,
    repairedCount: 0,
    droppedCount: 0,
    entries: [],
    messages: []
  };
}

export interface SanitizeResult {
  records: MoodRecord[];
  report: StorageRecoveryReport;
}

/**
 * 按记录降级恢复本地存储内容，明确区分真实数据 / 修复数据 / 被忽略数据：
 * - 整体无法解析或结构不是数组：判定为损坏，返回空集合与原因，不污染统计；
 * - 单条记录逐条校验：关键身份字段（日期）缺失或无效时忽略该条并记录原因；
 * - 标签、强度、ID、注记、气象观测字段缺失或越界时按规则降级修复；
 * - 被忽略的记录不进入返回结果，不参与任何统计与渲染。
 */
export function sanitizeMoodRecords(input: unknown, options: { parseFailed?: boolean } = {}): SanitizeResult {
  if (options.parseFailed) {
    return {
      records: [],
      report: {
        status: 'corrupted',
        totalStored: 0,
        keptCount: 0,
        repairedCount: 0,
        droppedCount: 0,
        entries: [],
        messages: ['本地存储内容损坏：JSON 解析失败，档案无法整体读取，已按空档案降级打开。']
      }
    };
  }

  if (!Array.isArray(input)) {
    return {
      records: [],
      report: {
        status: 'corrupted',
        totalStored: 0,
        keptCount: 0,
        repairedCount: 0,
        droppedCount: 0,
        entries: [],
        messages: ['本地存储结构无效：内容不是记录数组，已按空档案降级打开。']
      }
    };
  }

  const records: MoodRecord[] = [];
  const entries: RecordRecoveryEntry[] = [];
  const seenIds = new Set<string>();
  let keptCount = 0;
  let repairedCount = 0;
  let droppedCount = 0;

  input.forEach((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      droppedCount++;
      entries.push({ index, action: 'dropped', reasons: ['记录不是有效的对象结构，无法识别，已忽略。'] });
      return;
    }

    const raw = item as Record<string, unknown>;
    const rawTag = typeof raw.tag === 'string' && raw.tag.trim() ? raw.tag.trim() : undefined;
    const repairs: string[] = [];

    // 日期是关键身份字段：无法修复时只能忽略该条记录
    let date = typeof raw.date === 'string' ? raw.date.trim() : '';
    if (!DATE_RE.test(date) && date.length > 10 && DATE_RE.test(date.slice(0, 10))) {
      date = date.slice(0, 10);
      repairs.push('日期带有时间成分，已归一化为 YYYY-MM-DD。');
    }
    if (!isValidDate(date)) {
      droppedCount++;
      entries.push({
        index,
        action: 'dropped',
        tag: rawTag,
        reasons: ['缺少有效的日期字段（YYYY-MM-DD），无法放入气象时间线，已忽略。']
      });
      return;
    }

    // 标签缺失：降级为默认标签
    let tag = rawTag ?? '';
    if (!tag) {
      tag = DEFAULT_TAG;
      repairs.push(`缺少心情标签，已按「${DEFAULT_TAG}」降级。`);
    }

    // 强度缺失或越界：补齐或截断到 1-10
    let intensity = DEFAULT_INTENSITY;
    if (isFiniteNumber(raw.intensity)) {
      const normalized = Math.min(10, Math.max(1, Math.round(raw.intensity)));
      if (normalized !== raw.intensity) {
        repairs.push(`强度 ${raw.intensity} 超出 1-10 有效范围，已调整为 ${normalized}。`);
      }
      intensity = normalized;
    } else {
      repairs.push(`强度字段缺失或不是数字，已按 ${DEFAULT_INTENSITY} 级补齐。`);
    }

    // ID 缺失或重复：重新生成，避免删除 / 选中时串线
    let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    if (!id) {
      id = `rec-recovered-${date}-${index}`;
      repairs.push('缺少记录 ID，已重新生成。');
    } else if (seenIds.has(id)) {
      id = `${id}-fix${index}`;
      repairs.push('记录 ID 与其他记录重复，已重新生成以避免误删。');
    }
    seenIds.add(id);

    // 注记：类型无效时重置为默认文案
    let note = DEFAULT_NOTE;
    if (typeof raw.note === 'string') {
      note = raw.note.trim() || DEFAULT_NOTE;
    } else if (raw.note !== undefined && raw.note !== null) {
      repairs.push('心绪注记格式无效，已重置为默认文案。');
    }

    // 气象观测字段：任一缺失 / 越界则按标签与强度整体重算，保证统计口径一致
    const invalidDerived = DERIVED_FIELD_RULES.filter(rule => {
      const value = raw[rule.key];
      return !isFiniteNumber(value) || value < rule.min || value > rule.max;
    });
    const windNameInvalid = typeof raw.windDirectionName !== 'string' || !raw.windDirectionName;

    let derived: DerivedMeteorology;
    if (invalidDerived.length === 0 && !windNameInvalid) {
      derived = {
        pressureHpa: raw.pressureHpa as number,
        temperatureC: raw.temperatureC as number,
        humidityPercent: raw.humidityPercent as number,
        windSpeedKmH: raw.windSpeedKmH as number,
        windDirectionDeg: raw.windDirectionDeg as number,
        windDirectionName: raw.windDirectionName as string
      };
    } else {
      const badLabels = invalidDerived.map(rule => rule.label);
      if (windNameInvalid) badLabels.push('风向名称');
      derived = deriveMeteorologyFields(tag, intensity);
      repairs.push(`气象观测字段（${badLabels.join('、')}）缺失或越界，已依据标签与强度重新推算。`);
    }

    records.push({ id, date, tag, intensity, note, ...derived });

    if (repairs.length > 0) {
      repairedCount++;
      entries.push({ index, action: 'repaired', date, tag, reasons: repairs });
    } else {
      keptCount++;
    }
  });

  const status = repairedCount > 0 || droppedCount > 0 ? 'recovered' : 'ok';
  const messages =
    status === 'recovered'
      ? [`已按记录逐条降级恢复：保留 ${keptCount} 条，修复 ${repairedCount} 条，忽略 ${droppedCount} 条。被忽略的记录不参与任何统计。`]
      : [];

  return {
    records,
    report: {
      status,
      totalStored: input.length,
      keptCount,
      repairedCount,
      droppedCount,
      entries,
      messages
    }
  };
}
