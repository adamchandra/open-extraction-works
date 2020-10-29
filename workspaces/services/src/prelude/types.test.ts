//
import 'chai/register-should';
import { prettyPrint } from 'commons';

import _ from 'lodash';
import { AlphaRecord } from './types';

describe('Shared types', () => {

  it('decode AlphaRecords', () => {
    //
    const examples = [
      { noteId: 'okay', dblpConfId: 'okay', url: 'okay', title: 'okay', authorId: 'okay' },
      { noteId: 'okay', dblpConfId: 'okay', url: 'okay', title: 'okay' },
      { noteId: 'okay', dblpConfId: 'okay', url: 'okay' },
      { invalidField: 'okay' },
    ];
    _.each(examples, example => {

      const result = AlphaRecord.decode(example);
      prettyPrint({ result });

    })
  });
});
