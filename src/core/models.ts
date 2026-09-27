export type AlertLevel = '蓝色' | '黄色' | '橙色' | '红色';

export interface MoodTagMeta {
  tag: string;
  category: 'sunny' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';
  defaultPressure: number; // 960 - 1040 hPa
  defaultTemp: number;     // Celsius
  defaultHumidity: number; // 0 - 100%
  icon: string;
  windDesc: string;
  themeColor: string;
}

export interface MoodRecord {
  id: string;
  date: string; // YYYY-MM-DD
  tag: string;
  intensity: number; // 1 - 10
  note: string;
  pressureHpa: number;
  temperatureC: number;
  humidityPercent: number;
  windSpeedKmH: number;
  windDirectionDeg: number;
  windDirectionName: string;
}

export interface BarometricZone {
  code: string;
  name: string;
  psychologicalState: string;
  pressureRange: string;
  activeRatio: number; // 0 - 100%
  status: 'dominant' | 'active' | 'receding';
  description: string;
}

export interface MonsoonTrend {
  vectorName: string;
  originSource: string;
  frequencyDays: number;
  flowSpeed: string;
  windAngle: number;
  weatherImpact: string;
  upcomingForecast: string;
}

export interface ExtremeWeatherAlert {
  id: string;
  level: AlertLevel;
  type: string;
  title: string;
  issuedTime: string;
  triggerCause: string;
  defenseProtocol: string[]; // 防灾自愈指南
}

export type RecordRecoveryAction = 'repaired' | 'dropped';

export interface RecordRecoveryEntry {
  index: number;               // 在存储数组中的原始位置（从 0 开始）
  action: RecordRecoveryAction;
  date?: string;               // 能识别出的记录日期
  tag?: string;                // 能识别出的记录标签
  reasons: string[];           // 修复 / 忽略的具体原因
}

export interface StorageRecoveryReport {
  status: 'ok' | 'recovered' | 'corrupted';
  totalStored: number;         // 存储中检测到的记录条数
  keptCount: number;           // 原样保留
  repairedCount: number;       // 降级修复
  droppedCount: number;        // 无法修复被忽略
  entries: RecordRecoveryEntry[]; // 仅包含被修复 / 被忽略的记录明细
  messages: string[];
  quarantineKey?: string;      // 损坏原始数据的隔离备份键
}

export interface SynopticChartData {
  chartId: string;
  generatedDate: string;
  currentRecord: MoodRecord;
  records: MoodRecord[];
  averagePressure: number;
  zones: BarometricZone[];
  monsoon: MonsoonTrend;
  alerts: ExtremeWeatherAlert[];
  pressureSystemType: '强烈冷涡旋' | '副热带高压晴空' | '锋面气旋多变' | '温带反气旋平稳' | '深槽低气压阴霾';
  metSummary: string;
}
