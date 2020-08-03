import "chai/register-should";

import _ from "lodash";
import { stripMargin, prettyPrint } from 'commons';
import { ExtractionRecord } from './extraction-records';
import { parseJSON, isLeft, toError } from 'fp-ts/lib/Either';

export function parseJsonStripMargin(s: string): any | undefined {
  const s0 = stripMargin(s);
  const parsed = parseJSON(s0, toError);

  if (isLeft(parsed)) {
    const syntaxError = parsed.left;
    const posRE = /position (\d+)/;
    const posMatch = syntaxError.message.match(posRE);

    if (posMatch && posMatch.length > 1) {
      const errIndex = parseInt(posMatch[1]);
      const begin = Math.max(0, errIndex-50);
      const end = Math.min(s.length, errIndex+50);
      const pre = s0.slice(begin, errIndex+1)
      const post = s0.slice(errIndex+1, end)
      console.log(`${syntaxError}\nContext:\n${pre} <-- Error\n${post}`);
    }
    return;
  }
  return parsed.right;
}

describe("Extraction Records and Ground Records", () => {
  const sampleExtractionRecord = (`
| {
|   "kind": "fields",
|   "fields": {
|     "abstract": {
|       "exists": true,
|       "count": 0,
|       "instances": [
|         { "name": "abstract", "evidence": [],
|           "value": "Author Summary Whole-cell.."
|         },
|         { "name": "abstract", "evidence": [],
|           "value": "Whole-cell models ..."
|         }
|       ]
|     },
|     "title": {
|       "exists": true,
|       "count": 0,
|       "instances": [
|         { "name": "title", "evidence": [],
|           "value": "Some Title"
|         }
|       ]
|     },
|     "pdf-link": {
|       "exists": false,
|       "count": 0,
|       "instances": []
|     }
|   }
| }
`);
  const sampleGroundTruthRecord = (`
|[
| { "og": { "path": ["fields", "abstract", "count"], "value": 2 }, "gt": { "isCorrect": false, "value": 1 } },
| { "og": { "path": ["fields", "abstract", "title", "instances", "0", "value"], "value": "Some Title" }, "gt": { "isCorrect": false, "value": null } }
|]
`);

  // TODO: ground truth labeling procedure:
  //   Get a list of all paths in an extraction record, filtered to those that can be labeled
  //   declare object paths that can be labeled:
  //      ['fields', '.*']   =>
  //      ['fields', '.*', '\d+', 'value'] => true/false
  it("should traverse extraction records", () => {
    const extractionRec: ExtractionRecord = parseJsonStripMargin(sampleExtractionRecord);
    const groundTruthRec = parseJsonStripMargin(sampleGroundTruthRecord);
    prettyPrint({ extractionRec, groundTruthRec });
  });

//   const sampleNestedExtractionRecord = (`
// | {
// |   "kind": "groups",
// |   "groups": [
// |       ${sampleExtractionRecord},
// |       ${sampleExtractionRecord}
// |   ]
// `);

  it("should reconcile new values against ground-truth assertions", () => {
    // const gtRecs = [
    //   { "og.path": ["fields", "abstract", "0", "value"], "og.value": "Author Summary...", "gt.isCorrect": true },
    // ];

    // Possibilities:
    //   UpdatedValue         = _.get(og.path, new-rec);
    //   StillCorrect         = UpdatedValue == og.value && gt.isCorrect
    //   StillIncorrect       = UpdatedValue == og.value && !gt.isCorrect
    //   NewlyIncorrect       = UpdatedValue != og.value && gt.isCorrect
    //   MaybeCorrected       = UpdatedValue != og.value && !gt.isCorrect
    //   NewlyCorrected       = MaybeCorrected && new.value===gt.value
    //   MissingNewValue      = UpdatedValue == undefined
    //   MissingCorrect       = MissingNewValue && gt.isCorrect
    //   MissingIncorrect     = MissingNewValue && !gt.isCorrect
  });
});
