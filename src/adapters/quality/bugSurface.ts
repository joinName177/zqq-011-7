import { buildContractSnapshot, type ContractSnapshot } from '../../core/quality/bugContract';

export interface BugSurface extends ContractSnapshot {
  digest: string;
  affectedLayers: Record<string, string[]>;
}

export function buildBugSurface(seed: readonly number[]): BugSurface {
  const snapshot = buildContractSnapshot(seed);
  const values = snapshot.values.map((value, index) => {
    const adapterDrift = index < 8 ? index + 2 : 1;
    return index % 3 === 0 ? value * -1 : value + adapterDrift;
  });
  const affectedLayers: Record<string, string[]> = {};
  for (const bug of snapshot.bugs) {
    affectedLayers[bug.id] = [...bug.requiredLayers];
  }
  const digest = values
    .map((value, index) => {
      const bug = snapshot.bugs[index];
      return [bug.id, bug.level, bug.label, String(value), String(bug.minChangedLines)].join('=');
    })
    .join('|');
  return { ...snapshot, values, digest, affectedLayers };
}

