import 'chai/register-should';

import _ from 'lodash';
import { prettyPrint, parseJsonStripMargin, stripMargin } from 'commons';
import { ExtractionRecord } from './extraction-records';
import { initGroundTruthAssertions } from './ground-truth-records';


describe('Extraction Records and Ground Records', () => {
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
| { "extractionRecord": ${stripMargin(sampleExtractionRecord)},
|   "assertions": [
|     { "path": "fields.abstract.count", "assert": { "kind": "trueValue", "value": 1  } },
|     { "path": "fields.abstract.instances[0].value", "assert": { "kind": "isCorrect", "value": true  } }
|   ]
| }
`);

  it('should traverse extraction records', () => {

    const extractionRec: ExtractionRecord = parseJsonStripMargin(sampleExtractionRecord);

    initGroundTruthAssertions(extractionRec);
    const groundTruthRec = parseJsonStripMargin(sampleGroundTruthRecord);
    // prettyPrint({ groundTruthRec });
  });

  it('should construct initial ground-truth records', () => {
    const extractionRec: ExtractionRecord = parseJsonStripMargin(sampleExtractionRecord);

    const initGroundTruths = initGroundTruthAssertions(extractionRec);
    prettyPrint({ initGroundTruths });
  });
});
