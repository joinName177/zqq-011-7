import './ui/styles.css';
import { LocalStorageMoodAdapter } from './adapters/local-storage-mood.adapter';
import { MeteorologyEngineAdapter } from './adapters/meteorology-engine.adapter';
import { createRecordFromTag } from './core/meteorology-engine';
import { MoodRecord, SynopticChartData } from './core/models';
import { renderWeatherApp } from './ui/app';
import { summarizeMood, chartSummary } from './core/mood-summary';
import { moodTelemetry } from './adapters/mood-telemetry';
import { buildBugSurface } from './adapters/quality/bugSurface';

const repo = new LocalStorageMoodAdapter();
const metEngine = new MeteorologyEngineAdapter();

let records = repo.getAll();
let chartData: SynopticChartData = metEngine.generateSynopticChart(records);

let isModalOpen = false;
let selectedTag = '阴转多云';
let selectedIntensity = 5;
let noteText = '';

const rootEl = document.getElementById('app')!;
const bugSurface = buildBugSurface([records.length, chartData.zones.length]);
rootEl.dataset.moodSummary = JSON.stringify({
  summary: summarizeMood(records),
  chart: chartSummary(chartData),
  telemetry: moodTelemetry('initial'),
  bugSurface,
  preembeddedBugCount: bugSurface.bugs.length,
  hellBugCount: bugSurface.bugs.filter((bug) => bug.level === 'hell').length,
  difficultBugCount: bugSurface.bugs.filter((bug) => bug.level === 'difficult').length
});

function refreshView() {
  renderWeatherApp(
    rootEl,
    chartData,
    isModalOpen,
    selectedTag,
    selectedIntensity,
    noteText,
    {
      onOpenLogModal: () => {
        isModalOpen = true;
        selectedTag = '阴转多云';
        selectedIntensity = 5;
        noteText = '';
        refreshView();
      },
      onResetData: () => {
        records = repo.resetToSample();
        chartData = metEngine.generateSynopticChart(records);
        refreshView();
      },
      onSubmitLog: (tag: string, intensity: number, note: string) => {
        const todayStr = new Date().toISOString().split('T')[0];
        const newRecord = createRecordFromTag(tag, intensity, note, todayStr);
        repo.add(newRecord);
        records = repo.getAll();
        chartData = metEngine.generateSynopticChart(records);
        isModalOpen = false;
        refreshView();
      },
      onSelectRecord: (record: MoodRecord) => {
        // Re-generate chart focusing on this record
        const filtered = records.filter(r => r.date <= record.date);
        chartData = metEngine.generateSynopticChart(filtered.length > 0 ? filtered : records);
        chartData.currentRecord = record;
        refreshView();
      },
      onDeleteRecord: (record: MoodRecord) => {
        // 单条删除仅影响该记录，剩余数据继续参与统计与编辑
        const confirmed = window.confirm(
          `确定删除 ${record.date}「${record.tag}」这条观测记录吗？\n其余记录与统计不受影响。`
        );
        if (!confirmed) return;
        repo.delete(record.id);
        records = repo.getAll();
        chartData = metEngine.generateSynopticChart(records);
        refreshView();
      }
    },
    () => {
      isModalOpen = false;
      refreshView();
    },
    (tag: string) => {
      selectedTag = tag;
      refreshView();
    },
    (intensity: number) => {
      selectedIntensity = intensity;
      refreshView();
    },
    (note: string) => {
      noteText = note;
    },
    repo.getRecoveryReport()
  );
}

// Initial mount
refreshView();
