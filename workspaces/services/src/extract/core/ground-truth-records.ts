import { QualifiedKeyValue, toQualifiedKeyValues } from 'commons';
import _ from 'lodash';
import { ExtractionRecord } from './extraction-records';

export interface IsObservedValue {
  kind: 'IsObservedValue';
}

export interface IsCorrectValue {
  kind: 'IsCorrectValue';
}

export interface IsIncorrectValue {
  kind: 'IsIncorrectValue';
}

export type GroundTruthAssertion =
  IsObservedValue
  | IsCorrectValue
  | IsIncorrectValue
  ;

export interface GroundTruthLabel {
  pathValue: QualifiedKeyValue;
  assertions: GroundTruthAssertion[];
}

export interface GroundTruthLabels {
  labels: GroundTruthLabel[];
}

export function initGroundTruthAssertions(extractionRecord: ExtractionRecord): GroundTruthLabels {
  const pathValues: QualifiedKeyValue[] = toQualifiedKeyValues(extractionRecord);
  // retain entries that have leaf-paths named 'exists|count|value'
  const wanted = ['exists', 'count', 'value'];
  const retained: QualifiedKeyValue[] = _.flatMap(
    pathValues, pv => {
      const leafPathPart = _.last(pv[0]);
      if (leafPathPart && wanted.includes(leafPathPart)) {
        return [pv];
      }
      return [];
    });

  const labels = _.map(retained, v => {
    const isObserved: IsObservedValue = {
      kind: 'IsObservedValue',
    };
    const l: GroundTruthLabel = {
      pathValue: v,
      assertions: [isObserved],
    };
    return l;
  });

  // prettyPrint({ labels });

  return {
    labels
  };
}
