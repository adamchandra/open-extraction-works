import _ from 'lodash';
import * as DB from './database-tables';
import { AlphaRecord } from 'commons';
import ASync from 'async';
import { openDatabase } from './database';

export async function insertAlphaRecords(
  inputRecs: AlphaRecord[],
): Promise<DB.AlphaRecord[]> {
  const db = await openDatabase();
  const ins = await db.runTransaction(async (_sql, transaction) => {
    return await ASync.mapSeries<AlphaRecord, DB.AlphaRecord, Error>(
      inputRecs,
      async (rec: AlphaRecord) => {
        const { noteId, url, dblpConfId, authorId, title } = rec;
        return DB.AlphaRecord.create({
          noteId,
          url,
          title,
          dblpKey: dblpConfId,
          authorId: authorId,
        }, { transaction });
      }
    );
  });
  await db.close();
  return ins;
}
