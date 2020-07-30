import _ from 'lodash';
import * as DB from './database-tables';
import { AlphaRecord, prettyPrint } from 'commons';
import { Transaction } from 'sequelize/types';
import ASync from 'async';

export async function addAlphaRec(
  transaction: Transaction,
  alphaRequest: DB.AlphaRequest,
  rec: AlphaRecord
): Promise<DB.AlphaRecord> {

  const { noteId, url, dblpConfId, authorId, title } = rec;


  const _noteEntry = DB.NoteId.findCreateFind({
    where: { noteId },
    defaults: { noteId },
  });

  const _dblpIdEntry = DB.DblpId.findCreateFind({
    where: { dblpId: dblpConfId },
    defaults: { dblpId: dblpConfId },
  });

  const _urlEntry = DB.Url.findCreateFind({
    where: { url },
    defaults: { url },
  });


  return Promise.all([_noteEntry, _dblpIdEntry, _urlEntry])
    .then(([[noteEntry], [dblpIdEntry], [urlEntry]]) => {
      return DB.AlphaRecord.create({
        alphaRequest: alphaRequest.id,
        note: noteEntry.id,
        url: urlEntry.id,
        dblpId: dblpIdEntry.id,
        authorId: authorId,
        title: title,
      }, { transaction });
    });
}


export async function createAlphaUpload(
  transaction: Transaction,
  inputRecs: AlphaRecord[]
): Promise<DB.AlphaUpload | undefined> {
  const alphUpload = await DB.AlphaUpload.create({
    rawUpload: inputRecs,
  }, { transaction })
    .catch(error => {
      prettyPrint({ error });
    });

  if (!alphUpload) {
    prettyPrint({ msg: 'error: could not create alpha request' });
    return;
  }
  return alphUpload;
}

export async function createAlphaRequest(
  transaction: Transaction,
  inputRecs: AlphaRecord[]
): Promise<DB.AlphaRecord[]> {
  const alphaRequest = await DB.AlphaRequest.create({
    rawRequest: inputRecs,
  }, { transaction })
    .catch(error => {
      prettyPrint({ error });
    });

  if (!alphaRequest) {
    prettyPrint({ msg: 'error: could not create alpha request' });
    return []
  }

  return ASync.mapSeries<AlphaRecord, DB.AlphaRecord, Error>(
    inputRecs,
    async (rec: AlphaRecord) => {
      return addAlphaRec(transaction, alphaRequest, rec);
    }
  );
}
