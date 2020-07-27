import _ from 'lodash';
import * as DB from './database-tables';
import { AlphaRecord, prettyPrint, putStrLn } from 'commons';
import { Transaction } from 'sequelize/types';
import ASync from 'async';

export async function addAlphaRec(
  transaction: Transaction,
  alphaRequest: DB.AlphaRequest,
  rec: AlphaRecord
): Promise<DB.AlphaRecord> {

  const { noteId, url, dblpConfId, authorId, title } = rec;

  // prettyPrint({ msg: 'adding rec', rec });

  const [noteEntry] = await DB.NoteId.findCreateFind({
    where: { noteId },
    defaults: { noteId },
    transaction
  });

  const [dblpIdEntry] = await DB.DblpId.findCreateFind({
    where: { dblpId: dblpConfId },
    defaults: { dblpId: dblpConfId },
    transaction
  });

  const [urlEntry] = await DB.Url.findCreateFind({
    where: { url },
    defaults: { url },
    transaction
  });

  const alphaRec = await DB.AlphaRecord.create({
    alphaRequest: alphaRequest.id,
    note: noteEntry.id,
    url: urlEntry.id,
    dblpId: dblpIdEntry.id,
    authorId: authorId,
    title: title,
  }, { transaction });

  return alphaRec;
}


export async function createAlphaRequest(
  transaction: Transaction,
  inputRecs: AlphaRecord[]
): Promise<DB.AlphaRecord[]> {
  const alphaRequest = await DB.AlphaRequest.create({}, { transaction })
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
