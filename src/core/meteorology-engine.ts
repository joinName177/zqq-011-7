import {
  MoodRecord,
  MoodTagMeta,
  BarometricZone,
  MonsoonTrend,
  ExtremeWeatherAlert,
  SynopticChartData
} from './models';

export const TAG_METAS: Record<string, MoodTagMeta> = {
  '晴空万里': {
    tag: '晴空万里',
    category: 'sunny',
    defaultPressure: 1024,
    defaultTemp: 24,
    defaultHumidity: 45,
    icon: '☀️',
    windDesc: '微风拂面 · 东南风 2级',
    themeColor: '#ffb703'
  },
  '微风煦暖': {
    tag: '微风煦暖',
    category: 'sunny',
    defaultPressure: 1018,
    defaultTemp: 22,
    defaultHumidity: 50,
    icon: '🌤️',
    windDesc: '和煦暖风 · 南风 3级',
    themeColor: '#fb8500'
  },
  '阴转多云': {
    tag: '阴转多云',
    category: 'cloudy',
    defaultPressure: 1008,
    defaultTemp: 18,
    defaultHumidity: 65,
    icon: '⛅',
    windDesc: '静风无定向 · 气压平缓',
    themeColor: '#8ecae6'
  },
  '低气压大雾': {
    tag: '低气压大雾',
    category: 'fog',
    defaultPressure: 998,
    defaultTemp: 14,
    defaultHumidity: 92,
    icon: '🌫️',
    windDesc: '无风凝滞 · 能见度不足',
    themeColor: '#6c757d'
  },
  '局部有焦虑': {
    tag: '局部有焦虑',
    category: 'cloudy',
    defaultPressure: 992,
    defaultTemp: 26,
    defaultHumidity: 78,
    icon: '🌦️',
    windDesc: '偏西阵风 5级 · 气旋对流',
    themeColor: '#588157'
  },
  '暖湿气流过境': {
    tag: '暖湿气流过境',
    category: 'rain',
    defaultPressure: 1002,
    defaultTemp: 25,
    defaultHumidity: 85,
    icon: '🌧️',
    windDesc: '西南湿润气流 4级',
    themeColor: '#219ebc'
  },
  '突发雷暴': {
    tag: '突发雷暴',
    category: 'storm',
    defaultPressure: 975,
    defaultTemp: 20,
    defaultHumidity: 95,
    icon: '⛈️',
    windDesc: '强烈飑线 · 偏北强风 8级',
    themeColor: '#7209b7'
  },
  '寒潮大风': {
    tag: '寒潮大风',
    category: 'snow',
    defaultPressure: 1032,
    defaultTemp: -2,
    defaultHumidity: 30,
    icon: '❄️',
    windDesc: '西伯利亚干冷风 7级',
    themeColor: '#023e8a'
  }
};

const WIND_DIRECTION_NAMES = ['东北', '东', '东南', '南', '西南', '西', '西北', '北'] as const;

export interface TelemetryDraft {
  pressureHpa: number;
  temperatureC: number;
  humidityPercent: number;
  windSpeedKmH: number;
  windDirectionDeg: number;
  windDirectionName: string;
}

/** 由标签与强度派生全部气象指标；恢复损坏记录时按同一基准重算，保证统计口径一致 */
export function deriveTelemetry(tag: string, intensity: number): TelemetryDraft {
  const meta = TAG_METAS[tag] || TAG_METAS['阴转多云'];
  const safeIntensity = Number.isFinite(intensity) ? Math.max(1, Math.min(10, intensity)) : 5;
  const pressureOffset = (5 - safeIntensity) * 3;
  const pressureHpa = Math.max(960, Math.min(1045, meta.defaultPressure + pressureOffset));
  const tempOffset = (safeIntensity - 5) * 1.2;
  const temperatureC = Math.round(meta.defaultTemp + tempOffset);
  const humidityPercent = Math.min(100, Math.max(20, meta.defaultHumidity + (safeIntensity > 6 ? 10 : -5)));

  const dirIdx = Math.abs((tag.charCodeAt(0) + safeIntensity) % 8);
  const windDeg = dirIdx * 45;
  const windSpeed = 5 + safeIntensity * 3.5;

  return {
    pressureHpa,
    temperatureC,
    humidityPercent,
    windSpeedKmH: Math.round(windSpeed),
    windDirectionDeg: windDeg,
    windDirectionName: WIND_DIRECTION_NAMES[dirIdx]
  };
}

/** 由风向角度反推八方位中文名，非法角度回退东南风 */
export function windDirectionNameOf(deg: number): string {
  if (!Number.isFinite(deg)) return WIND_DIRECTION_NAMES[2];
  const idx = (((Math.round(deg / 45) % 8) + 8) % 8);
  return WIND_DIRECTION_NAMES[idx];
}

function generateRecordId(): string {
  return `rec-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function createRecordFromTag(tag: string, intensity: number, note: string, dateStr?: string): MoodRecord {
  return {
    id: generateRecordId(),
    date: dateStr || new Date().toISOString().split('T')[0],
    tag,
    intensity: Number.isFinite(intensity) ? Math.max(1, Math.min(10, intensity)) : 5,
    note: note.trim() || '平静观测记录',
    ...deriveTelemetry(tag, intensity)
  };
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function evaluateSynopticSystem(recordsInput: MoodRecord[]): SynopticChartData {
  // 统计层双保险：过滤掉关键数值字段损坏的记录，单条坏记录不污染全部统计
  const validInput = recordsInput.filter(
    r =>
      !!r &&
      typeof r.date === 'string' &&
      isFiniteNumber(r.pressureHpa) &&
      isFiniteNumber(r.temperatureC) &&
      isFiniteNumber(r.humidityPercent) &&
      isFiniteNumber(r.windSpeedKmH) &&
      isFiniteNumber(r.windDirectionDeg) &&
      isFiniteNumber(r.intensity)
  );
  // YYYY-MM-DD 可直接做字符串比较，避免 new Date(非法日期) 产生 NaN 打乱排序
  const sorted = [...validInput].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const currentRecord = sorted[sorted.length - 1] || createRecordFromTag('阴转多云', 5, '平静观测记录');

  const totalPressure = sorted.reduce((acc, r) => acc + r.pressureHpa, 0);
  const avgPressure = sorted.length > 0 ? Math.round(totalPressure / sorted.length) : 0;

  // Barometric zones analysis
  let equatorial = 0; // high intensity + low/moderate pressure
  let subTropical = 0; // high pressure sunny
  let subPolar = 0; // low pressure sad/fog
  let polarCold = 0; // high pressure freezing/detached

  sorted.forEach(r => {
    if (r.pressureHpa >= 1020 && r.temperatureC > 15) subTropical++;
    else if (r.pressureHpa >= 1020 && r.temperatureC <= 10) polarCold++;
    else if (r.pressureHpa <= 995) subPolar++;
    else equatorial++;
  });

  const total = sorted.length || 1;
  const zones: BarometricZone[] = [
    {
      code: 'Z-STH',
      name: '副热带高压带（心境晴朗稳定）',
      psychologicalState: '精力平稳、秩序感充足、心态从容明朗',
      pressureRange: '1018 ~ 1030 hPa',
      activeRatio: Math.round((subTropical / total) * 100),
      status: subTropical >= total * 0.35 ? 'dominant' : 'active',
      description: '受反气旋沉降气流控制，天空云量稀少，注意力聚焦，内耗极低。'
    },
    {
      code: 'Z-EQU',
      name: '赤道低压槽（充沛对流与灵感）',
      psychologicalState: '情绪敏感、灵感涌动、轻微情绪躁动',
      pressureRange: '1000 ~ 1015 hPa',
      activeRatio: Math.round((equatorial / total) * 100),
      status: equatorial >= total * 0.35 ? 'dominant' : 'active',
      description: '对流活动旺盛，情绪水汽充沛，容易产生即兴表达欲与探索热情。'
    },
    {
      code: 'Z-SPL',
      name: '副极地低气压带（低落潮湿阻滞）',
      psychologicalState: '情绪内耗、局部焦虑、精力低谷期',
      pressureRange: '970 ~ 998 hPa',
      activeRatio: Math.round((subPolar / total) * 100),
      status: subPolar >= total * 0.35 ? 'dominant' : 'active',
      description: '暖冷气团交汇形成持久锋面雨带，情绪云层厚重，阳光穿透力减弱。'
    },
    {
      code: 'Z-POL',
      name: '极地冷高压区（情感冷却与封闭）',
      psychologicalState: '冷漠理性、拒绝社交、自我防御开启',
      pressureRange: '1025 ~ 1045 hPa (低温)',
      activeRatio: Math.round((polarCold / total) * 100),
      status: polarCold >= total * 0.2 ? 'dominant' : 'receding',
      description: '温度跌破防御线，地表热量迅速散失，表现为情绪冷淡与沉默。'
    }
  ];

  // Monsoon trend analysis
  const recentSlice = sorted.slice(-7);
  const avgIntensity = recentSlice.reduce((s, r) => s + r.intensity, 0) / (recentSlice.length || 1);
  const hasStorm = recentSlice.some(r => r.pressureHpa < 985);

  let vectorName = '东亚温和偏南季风';
  let originSource = '来自生活日常与适度社交温和气团';
  let flowSpeed = '微风 12 km/h';
  let windAngle = 135;
  let weatherImpact = '气压平衡，情绪系统处于舒适自净区间';
  let upcomingForecast = '预计未来三天无明显冷空气入侵，维持多云转晴趋势。';

  if (avgPressure < 995 || hasStorm) {
    vectorName = '西南热带气旋逆时针切变流';
    originSource = '来自多重待办任务与社交过载的深层热低压';
    flowSpeed = '疾风 48 km/h';
    windAngle = 225;
    weatherImpact = '带来间歇性焦虑降水与情绪飑线，心理湿度高居不下';
    upcomingForecast = '警惕情绪二次对流反弹，建议尽早启动防灾避雨防御。';
  } else if (avgPressure > 1020) {
    vectorName = '高压脊平直西风气流';
    originSource = '来自坚实生活秩序与专注工作带来的稳定反气旋';
    flowSpeed = '清风 18 km/h';
    windAngle = 270;
    weatherImpact = '视界清晰无云，情绪能见度极高，适合规划长期战略';
    upcomingForecast = '高压系统稳定，气温宜人，建议保持当前生活节律。';
  }

  const monsoon: MonsoonTrend = {
    vectorName,
    originSource,
    frequencyDays: recentSlice.length,
    flowSpeed,
    windAngle,
    weatherImpact,
    upcomingForecast
  };

  // Alerts
  const alerts: ExtremeWeatherAlert[] = [];
  const lastRecord = currentRecord;

  if (lastRecord.pressureHpa < 980 || (lastRecord.tag === '突发雷暴' && lastRecord.intensity >= 8)) {
    alerts.push({
      id: 'alert-red-storm',
      level: '红色',
      type: '情绪特大暴雨与雷电暴风预警',
      title: '红色暴雨预警 · 情绪超负荷对流',
      issuedTime: lastRecord.date,
      triggerCause: `中心气压降至 ${lastRecord.pressureHpa}hPa，阵风超速，局部心理降水量达特大暴雨级别。`,
      defenseProtocol: [
        '立即暂停所有高摩擦高风险的人际沟通与决策。',
        '退回物理安全区（卧室/安静角落），拉上窗帘切断过多声光刺激。',
        '进行5次深长腹式呼吸，允许眼泪或倾诉作为自然水汽释放。',
        '备用应急热饮（热牛奶或洋甘菊茶），等待气旋中心移出。'
      ]
    });
  } else if (lastRecord.tag === '局部有焦虑' && lastRecord.intensity >= 7) {
    alerts.push({
      id: 'alert-orange-anxiety',
      level: '橙色',
      type: '干热高温与强对流焦虑预警',
      title: '橙色预警 · 局部焦虑气团盘旋',
      issuedTime: lastRecord.date,
      triggerCause: `心理湿度高达 ${lastRecord.humidityPercent}%，内热积蓄，出现明显心率过载与思绪乱流。`,
      defenseProtocol: [
        '执行“注意力物理降温”：离开发生焦虑的工位，步行洗脸或冷水洗手。',
        '将脑中盘旋的所有待办事项写在纸上，关停后台大脑线程。',
        '禁止在当夜进行自我复盘或批判，推迟至明早高压回升后再议。'
      ]
    });
  } else if (lastRecord.tag === '寒潮大风') {
    alerts.push({
      id: 'alert-yellow-cold',
      level: '黄色',
      type: '情感寒潮与社交冰封预警',
      title: '黄色预警 · 极地干冷冷锋压境',
      issuedTime: lastRecord.date,
      triggerCause: `气温剧烈骤降至 ${lastRecord.temperatureC}°C，情绪能量趋近冰点，防御性坚冰形成。`,
      defenseProtocol: [
        '不必强迫自己热情回应外界信息，开启社交请假条/免打扰模式。',
        '通过热汤、暖水袋、厚毯子提供基础躯体热量。',
        '倾听白噪音或重温一部熟悉的童年治愈老电影。'
      ]
    });
  }

  // Determine system type
  let pressureSystemType: SynopticChartData['pressureSystemType'] = '温带反气旋平稳';
  if (sorted.length === 0) {
    pressureSystemType = '温带反气旋平稳';
  } else if (avgPressure >= 1020) pressureSystemType = '副热带高压晴空';
  else if (avgPressure < 990) pressureSystemType = '强烈冷涡旋';
  else if (alerts.length > 0) pressureSystemType = '锋面气旋多变';
  else pressureSystemType = '深槽低气压阴霾';

  return {
    chartId: `SYN-${Date.now().toString(36).toUpperCase()}`,
    generatedDate: new Date().toLocaleDateString('zh-CN'),
    currentRecord,
    records: sorted,
    averagePressure: avgPressure,
    zones,
    monsoon,
    alerts,
    pressureSystemType,
    metSummary:
      sorted.length === 0
        ? '气象综观显示：当前心境领空暂无观测记录，等待第一条心情天气签到。'
        : `气象综观显示：当前心境领空受【${pressureSystemType}】统御。全周期平均气压 ${avgPressure} hPa，近期主要受【${monsoon.vectorName}】影响。${alerts.length > 0 ? `当前挂起 ${alerts.length} 个灾害性气象预警！` : '整层大气环流平稳，无破坏性对流。'}`
  };
}
