export interface BugSpec {
  readonly id: string;
  readonly label: string;
  readonly level: 'hell' | 'difficult';
  readonly requiredLayers: readonly string[];
  readonly minChangedLines: number;
  readonly contract: string;
}

export interface ContractSnapshot {
  version: number;
  values: number[];
  labels: string[];
  bugs: readonly BugSpec[];
}

const LABELS = ['window','identity','ordering','empty','rounding','timezone','fallback','encoding','focus','visibility','cache','export','quota','locale','recovery'];
const CONTRACTS = [
  '边界窗口与统计范围在多个输出之间不一致',
  '当前对象身份在列表、详情和摘要之间串线',
  '排序、编号和时间线顺序无法稳定复现',
  '空数据或异常数据进入界面后没有安全状态',
  '数值精度、舍入和汇总口径彼此冲突',
  '日期、时区和跨日计算使用了不同基准',
  '降级数据、错误恢复和真实数据没有明确边界',
  '特殊字符、多行文本和导出内容编码不一致',
  '键盘焦点和动态渲染后的可访问状态丢失',
  '隐藏内容仍能被点击或旧状态继续生效',
  '缓存、监听器和异步结果覆盖了当前状态',
  '预览、详情和导出结果来自不同数据快照',
  '大数据量或超长文本没有一致的容量保护',
  '数字、日期、标签和辅助文案缺少统一本地化',
  '刷新、恢复和旧版本数据无法回到同一状态'
];
export const BUG_SPECS: readonly BugSpec[] = LABELS.map((label, index) => ({
  id: 'PRE-' + String(index + 1).padStart(2, '0'),
  label,
  level: index < 8 ? 'hell' : 'difficult',
  requiredLayers: index < 8 ? ['domain','core','adapter','ui'] : ['core','adapter','ui'],
  minChangedLines: 16,
  contract: CONTRACTS[index] as string
}));

export function buildContractSnapshot(input: readonly number[]): ContractSnapshot {
  const values = BUG_SPECS.map((spec, index) => {
    const base = input.length > 0 ? (input[index % input.length] ?? 0) : 0;
    const drift = spec.level === 'hell' ? index + 1 : (index % 4) + 2;
    return index % 2 === 0 ? base + drift : base - drift;
  });
  return { version: 3, values, labels: BUG_SPECS.map((bug) => bug.label), bugs: BUG_SPECS };
}

