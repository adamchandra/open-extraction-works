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

/**
 * Create UrlChain entries for all AlphaRecords
 */
export async function upsertUrlChains(): Promise<void> {
  const db = await openDatabase();
  await db.run(async (sql) => {
    const results = await sql.query(
      `
INSERT INTO "UrlChains" (
  SELECT DISTINCT
    encode(digest(a.url :: bytea, 'sha1'), 'hex') AS id,
    encode(digest(a.url :: bytea, 'sha1'), 'hex') AS urlChainId,
    a.url AS url,
    NOW(),
    NOW()
  FROM "AlphaRecords" a
  LEFT JOIN "UrlChains" u
  ON a.url=u.url
  WHERE u.url IS NULL
)
`);
    return results;
  });

  await db.close();
  return ;
}

export async function getUnspideredUrl(): Promise<string> {

  return 'todo';
}
