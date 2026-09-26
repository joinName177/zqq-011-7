# cyc-013 · 情绪气象台 · 心灵天气图系统

纯前端情绪气象转化与可视化系统。用户每日记录心情标签（如"阴转多云"、"局部有焦虑"、"暖湿气流过境"），系统将个人情绪数据转化为一套完整的气象系统，生成专属的"情绪天气图"（等压线、高/低气压中心、锋面、风向场），支持查看情绪气压带、季风趋势和极端天气预警与自愈指南。

## 架构说明（分层架构：核心层 / 端口层 / 适配器层）

- `src/core`：领域模型（`MoodRecord`、`BarometricZone`、`MonsoonTrend`、`ExtremeWeatherAlert`、`SynopticChartData`）与气象测算引擎（气压/湿度/温度/季风/预警计算规则）。
- `src/ports`：端口层定义契约（`MoodRepositoryPort` 心情存储端口、`MeteorologyPort` 气象系统推演端口）。
- `src/adapters`：适配器层（LocalStorage 持久化与内置14天气象序列适配器、气象计算引擎适配器）。
- `src/ui`：原生 CSS 视觉呈现层，包含综观天气图 SVG 动态矢量图、气压带进度表、季风走向雷达与灾害预警防灾指南。

## 本地运行

```bash
npm install
npm run dev
```

## 构建验证

```bash
npm run build
```

## Docker 容器化部署

```bash
docker compose up --build
```
访问：`http://localhost:8013`
