import { MoodRecord, SynopticChartData } from '../core/models';

export interface MeteorologyPort {
  generateSynopticChart(records: MoodRecord[]): SynopticChartData;
}
