import { MoodRecord } from './models';
import { TAG_METAS, deriveTelemetry, windDirectionNameOf } from './meteorology-engine';

export type RecoveryStatus = 'kept' | 'repaired' | 'ignored';

/** 单条记录的降级恢复结果 */
export interface RecoveredRecordEntry {
  index: number;
  status: RecoveryStatus;
  /** 修复/忽略原因（kept 时为空），明确告知用户每条数据发生了什么 */
  reasons: string[];
  /** 可用于界面展示的记录身份标识（日期 + 标签，可能未知） */
  identity: string;
  record: MoodRecord | null;
}

/** 整批数据的恢复报告 */
export interface RecoveryReport {
  /** 被整条忽略、无法进入统计的记录数 */
  ignoredCount: number;
  /** 字段缺失/越界被自动修复的记录数 */
  repairedCount: number;
  /** 完整保留的记录数 */
  keptCount: number;
  ignored: RecoveredRecordEntry[];
  repaired: RecoveredRecordEntry[];
  /** 存储层的整体说明（原始 JSON 损坏、已隔离备份、只读降级等） */
  storageNotices: string[];
}

export function emptyRecoveryReport(): RecoveryReport {
  return { ignoredCount: 0, repairedCount: 0, keptCount: 0, ignored: [], repaired: [], storageNotices: [] };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** YYYY-MM-DD 严格日期校验，拒绝 undefined、null、数字、非法日期文本 */
function isValidDateString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function inRange(v: number, min: number, max: number): boolean {
  return v >= min && v <= max;
}

let seq = 0;
function generateRecordId(): string {
  seq += 1;
  return `rec-restored-${Date.now()}-${seq}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * 按记录降级恢复：逐条检查字段。
 * - 关键字段（日期）非法：整条忽略，绝不进入统计；
 * - 数值/标签等字段缺失或越界：按标签基准就地修复，记录仍可继续编辑；
 * - 完全合法：原样保留。
 */
export function recoverRecord(raw: unknown, index: number, usedIds: Set<string>): RecoveredRecordEntry {
  const identity = isObj(raw)
    ? `${isNonEmptyString(raw.date) ? raw.date : '日期未知'} / ${isNonEmptyString(raw.tag) ? raw.tag : '标签未知'}`
    : `第 ${index + 1} 条`;

  if (!isObj(raw)) {
    return { index, status: 'ignored', reasons: ['记录不是有效的对象（可能被截断或写成了标量值）'], identity, record: null };
  }

  // 日期是排序、统计窗口与界面时间线的基准，缺失/非法无法安全定位，整条忽略
  if (!isValidDateString(raw.date)) {
    return { index, status: 'ignored', reasons: ['日期字段缺失或不是合法的 YYYY-MM-DD 格式，无法定位观测时间'], identity, record: null };
  }

  const reasons: string[] = [];

  // 标签：缺失或为内置未知标签时回退默认标签（气象基准随之重算）
  let tag = isNonEmptyString(raw.tag) ? raw.tag : '';
  if (!tag) {
    tag = '阴转多云';
    reasons.push('心情标签缺失，已回退为“阴转多云”');
  } else if (!TAG_METAS[tag]) {
    tag = '阴转多云';
    reasons.push(`心情标签“${raw.tag}”无法识别，已回退为“阴转多云”`);
  }

  // 强度：缺失/非数字给中性值 5，越界裁剪到 1-10
  let intensity: number;
  if (!isFiniteNumber(raw.intensity)) {
    intensity = 5;
    reasons.push('对流强度缺失或不是数字，已按中等级 5 补全');
  } else if (!inRange(raw.intensity, 1, 10)) {
    intensity = Math.max(1, Math.min(10, raw.intensity));
    reasons.push(`对流强度 ${raw.intensity} 超出 1-10 范围，已裁剪为 ${intensity}`);
  } else {
    intensity = raw.intensity;
  }

  // 备注：缺失/非字符串给空串（保存时自动转为默认注记）
  let note: string;
  if (typeof raw.note !== 'string') {
    note = '';
    reasons.push('心绪注记缺失，已置为空');
  } else {
    note = raw.note;
  }

  // ID：缺失/非字符串/与其他记录重复时重新生成
  let id: string;
  if (!isNonEmptyString(raw.id)) {
    id = generateRecordId();
    reasons.push('记录 ID 缺失，已重新生成');
  } else {
    id = raw.id;
  }

  const draft = deriveTelemetry(tag, intensity);

  // 气象指标：缺失/非数字/超出物理合理区间的，按标签+强度基准重算
  let pressureHpa = isFiniteNumber(raw.pressureHpa) ? raw.pressureHpa : NaN;
  if (!inRange(pressureHpa, 900, 1100)) {
    pressureHpa = draft.pressureHpa;
    reasons.push(`气压值${isFiniteNumber(raw.pressureHpa) ? ` ${raw.pressureHpa} hPa 越界` : '缺失'}，已按标签基准重算为 ${pressureHpa} hPa`);
  }

  let temperatureC = isFiniteNumber(raw.temperatureC) ? raw.temperatureC : NaN;
  if (!inRange(temperatureC, -60, 60)) {
    temperatureC = draft.temperatureC;
    reasons.push(`温度值${isFiniteNumber(raw.temperatureC) ? ` ${raw.temperatureC}°C 越界` : '缺失'}，已按标签基准重算为 ${temperatureC}°C`);
  }

  let humidityPercent = isFiniteNumber(raw.humidityPercent) ? raw.humidityPercent : NaN;
  if (!inRange(humidityPercent, 0, 100)) {
    humidityPercent = draft.humidityPercent;
    reasons.push(`湿度值${isFiniteNumber(raw.humidityPercent) ? ` ${raw.humidityPercent}% 越界` : '缺失'}，已按标签基准重算为 ${humidityPercent}%`);
  }

  let windSpeedKmH = isFiniteNumber(raw.windSpeedKmH) ? raw.windSpeedKmH : NaN;
  if (!inRange(windSpeedKmH, 0, 300)) {
    windSpeedKmH = draft.windSpeedKmH;
    reasons.push(`风速值${isFiniteNumber(raw.windSpeedKmH) ? ` ${raw.windSpeedKmH} km/h 越界` : '缺失'}，已按标签基准重算为 ${windSpeedKmH} km/h`);
  }

  // 风向角度：缺失/非数字/越界按标签+强度重算
  let windDirectionDeg = isFiniteNumber(raw.windDirectionDeg) ? raw.windDirectionDeg : NaN;
  if (!inRange(windDirectionDeg, 0, 360)) {
    windDirectionDeg = draft.windDirectionDeg;
    reasons.push(`风向角度${isFiniteNumber(raw.windDirectionDeg) ? ` ${raw.windDirectionDeg}° 越界` : '缺失'}，已按标签基准重算为 ${windDirectionDeg}°`);
  }

  // 风向名称：缺失/非字符串时由角度反推；若名称与角度不一致也以角度为准校正
  let windDirectionName: string;
  if (!isNonEmptyString(raw.windDirectionName)) {
    windDirectionName = windDirectionNameOf(windDirectionDeg);
    reasons.push(`风向名称缺失，已按风向角度补全为“${windDirectionName}风”`);
  } else {
    windDirectionName = raw.windDirectionName;
    const expectedName = windDirectionNameOf(windDirectionDeg);
    if (windDirectionName !== expectedName) {
      windDirectionName = expectedName;
      reasons.push(`风向名称与角度 ${windDirectionDeg}° 不一致，已校正为“${windDirectionName}风”`);
    }
  }

  if (usedIds.has(id)) {
    const oldId = id;
    id = generateRecordId();
    reasons.push(`记录 ID（${oldId}）与其他记录重复，已重新生成`);
  }
  usedIds.add(id);

  const record: MoodRecord = {
    id,
    date: raw.date,
    tag,
    intensity,
    note,
    pressureHpa,
    temperatureC,
    humidityPercent,
    windSpeedKmH,
    windDirectionDeg,
    windDirectionName
  };

  return {
    index,
    status: reasons.length > 0 ? 'repaired' : 'kept',
    reasons,
    identity,
    record
  };
}

/** 批量恢复；返回可安全使用的记录（按日期排序）与详细报告 */
export function recoverRecords(rawList: unknown[], storageNotices: string[] = []): {
  records: MoodRecord[];
  report: RecoveryReport;
} {
  const usedIds = new Set<string>();
  const entries = rawList.map((raw, i) => recoverRecord(raw, i, usedIds));
  const records = entries
    .filter((e): e is RecoveredRecordEntry & { record: MoodRecord } => e.record !== null)
    .map(e => e.record)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const ignored = entries.filter(e => e.status === 'ignored');
  const repaired = entries.filter(e => e.status === 'repaired');
  const report: RecoveryReport = {
    ignoredCount: ignored.length,
    repairedCount: repaired.length,
    keptCount: entries.length - ignored.length - repaired.length,
    ignored,
    repaired,
    storageNotices
  };
  return { records, report };
}
