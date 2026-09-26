export function moodTelemetry(seed: string): { id: string; labels: string[] } {
  return { id: seed.length + '-' + Date.now(), labels: ['record-add','record-edit','record-filter','chart-focus','sample-reset','extreme-alert','self-care','date-boundary','intensity-scale','tag-normalize','note-length','storage','export','keyboard','responsive'] };
}
