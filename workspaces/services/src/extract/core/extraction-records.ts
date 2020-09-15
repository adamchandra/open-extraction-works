/**
 * Logs and Records generated during field extraction and Url scraping
 */

import _ from 'lodash';

export interface Field {
  name: string;
  evidence: string[];
  value?: string;
}

export interface FieldInstances {
  exists: boolean;
  count: number;
  instances: Field[];
}

export interface ExtractedFields {
  kind: 'fields';
  fields: Record<string, FieldInstances>;
}

export interface ExtractedStanzas {
  kind: 'stanzas';
  stanzas: string[];
}

export interface ExtractedGroups {
  kind: 'groups';
  groups: ExtractedFields[];
}
export interface ExtractionErrors {
  kind: 'errors';
  errors: string[];
}
export interface ExtractionEvidence {
  kind: 'evidence';
  evidence: string;
  weight: number;
}

export type ExtractionRecord =
  ExtractedFields
  | ExtractedStanzas
  | ExtractedGroups
  | ExtractionErrors
  | ExtractionEvidence
  ;


export interface ExtractionRecordFoldCases<A> {
  onFields: (v: ExtractedFields) => A;
  onStanzas: (v: ExtractedStanzas) => A;
  onGroups: (v: ExtractedGroups) => A;
  onErrors: (v: ExtractionErrors) => A;
  onEvidence: (v: ExtractionEvidence) => A,
}

const emptyFoldCases: ExtractionRecordFoldCases<undefined> = {
  onFields: () => undefined,
  onStanzas: () => undefined,
  onGroups: () => undefined,
  onErrors: () => undefined,
  onEvidence: () => undefined,
}

export function foldExtractionRec<A>(
  rec: ExtractionRecord,
  cases: Partial<ExtractionRecordFoldCases<A>>
): A | undefined {
  const cs = _.merge({}, emptyFoldCases, cases);
  switch (rec.kind) {
    case 'fields': return cs.onFields(rec);
    case 'stanzas': return cs.onStanzas(rec);
    case 'groups': return cs.onGroups(rec);
    case 'errors': return cs.onErrors(rec);
    case 'evidence': return cs.onEvidence(rec);
  }
}

export function addFieldInstance(rec: ExtractionRecord, field: Field): void {
  return foldExtractionRec(rec, {
    onFields: (rec) => {
      const instances: FieldInstances =
        rec.fields[field.name] || { exists: true, count: 0, instances: [] };

      instances.instances.push(field);
      instances.count += 1;
      rec.fields[field.name] = instances;
    }
  });
}

