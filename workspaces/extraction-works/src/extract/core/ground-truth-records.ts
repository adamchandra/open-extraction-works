import _ from "lodash";
import { ExtractionRecord } from './extraction-records';

export interface GroundTruthEntry {
  extractionRecord: ExtractionRecord;
  notes: string[];
}

export interface GroundTruthLog {
  entries: GroundTruthEntry[];
  notes: string[];
}


export function initGroundTruthEntry(extractionRecord: ExtractionRecord, ...notes: string[]): GroundTruthEntry {
  return {
    extractionRecord,
    notes: [...notes],
  };
}

export function initGroundTruthLog(...notes: string[]): GroundTruthLog {
  return {
    entries: [],
    notes: [...notes]
  }
}

export function addGroundTruthEntry(log: GroundTruthLog, entry: GroundTruthEntry): void {
  log.entries.push(entry);
}
