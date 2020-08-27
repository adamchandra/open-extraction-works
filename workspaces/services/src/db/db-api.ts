import _ from 'lodash';
import * as DB from './database-tables';
import { AlphaRecord, prettyPrint, stripMargin } from 'commons';
import ASync from 'async';
import { openDatabase } from './database';
import { Metadata } from '~/spidering/data-formats';

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

export async function insertNewUrlChains(): Promise<void> {
  const db = await openDatabase();

  // const [queryResults, queryMeta] =
  await db.run(async (sql) => {
    const results = await sql.query(stripMargin(`
|INSERT INTO "UrlChains" (
|  SELECT DISTINCT
|    ar.url AS url,
|    ar.url AS "rootUrl",
|    null as "responseUrl",
|    'status:new' as "statusCode",
|    NOW() as "createdAt",
|    NOW() as "updatedAt"
|  FROM "AlphaRecords" ar
|  LEFT JOIN "UrlChains" uc
|  ON ar.url=uc.url
|  WHERE uc.url IS NULL
|)
|RETURNING url
|`));
    return results;
  });

  // prettyPrint({ queryMeta, queryResults });
  await db.close();
}

export async function getNextUrlForSpidering(): Promise<string | undefined> {
  const db = await openDatabase();
  const [queryResults, queryMeta] =
    await db.run(async (sql) => {
      const results = await sql.query(stripMargin(`
| update "UrlChains"
| set "statusCode" = 'spider:in-progress'
| where url = (
|   select url
|   from "UrlChains"
|   where "statusCode" = 'status:new'
|   limit 1
| )
|RETURNING url
|`));
      return results;
    });

  // prettyPrint({ queryMeta, queryResults });
  const results: Array<{ url: string }> = queryResults as any;

  await db.close();
  const nextUrl = results.length > 0 ? results[0].url : undefined;
  return nextUrl;
}

export async function commitMetadata(metadata: Metadata): Promise<void> {
  const db = await openDatabase();

  const { requestUrl, responseUrl, status, fetchChain } = metadata;

  const [queryResults, queryMeta] =
    await db.run(async (sql) => {

      // TODO on conflict ...
      const insertValues = _.map(_.tail(fetchChain), l => {
        const resp = l.responseUrl || '';
        const status = `http:${l.status}`;
        return `(${sql.escape(requestUrl)}, ${sql.escape(l.requestUrl)}, ${sql.escape(resp)}, ${sql.escape(status)}, NOW(), NOW())`;
      });
      const valuesClause = _.join(insertValues, ', ');

      const query = stripMargin(`
|       insert into "UrlChains"
|         ("rootUrl", "url", "responseUrl", "statusCode", "createdAt", "updatedAt")
|         values ${valuesClause}
|     `);

      prettyPrint({ query });
      const results = await sql.query(query);
      return results;
    });

  prettyPrint({ queryMeta, queryResults });

  await db.close();
}
