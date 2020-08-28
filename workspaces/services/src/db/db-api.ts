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
  const [queryResults] =
    await db.run(async (sql) => {
      const results = await sql.query(stripMargin(`
|       UPDATE "UrlChains"
|       SET "statusCode" = 'spider:in-progress'
|       WHERE url = (
|         SELECT url
|         FROM "UrlChains"
|         WHERE "statusCode" = 'status:new'
|         LIMIT 1
|       )
|      RETURNING url
|      `));
      return results;
    });

  // prettyPrint({ queryMeta, queryResults });
  const results: Array<{ url: string }> = queryResults as any;

  await db.close();
  const nextUrl = results.length > 0 ? results[0].url : undefined;
  return nextUrl;
}

export interface UrlStatus {
  url: string;
  statusCode: string;
}
export async function commitMetadata(metadata: Metadata): Promise<UrlStatus|undefined> {
  const db = await openDatabase();

  const { requestUrl, responseUrl, status } = metadata;

  const [queryResults] =
    await db.run(async (sql) => {
      const esc = (s: string) => sql.escape(s);
      const httpStatus = `http:${status}`;

      const query = stripMargin(`
|       UPDATE "UrlChains"
|         SET
|           "statusCode" = ${esc(httpStatus)},
|           "responseUrl" = ${esc(responseUrl)},
|           "updatedAt" = NOW()
|         WHERE
|           url = ${esc(requestUrl)}
|           AND "statusCode" = 'spider:in-progress'
|         RETURNING "url", "statusCode"
`);

      const results = await sql.query(query);
      return results;
    });

  const response: UrlStatus[] = queryResults as any[];

  await db.close();
  return response[0];
}

export async function commitMetadataUrlChain(metadata: Metadata): Promise<void> {
  const db = await openDatabase();

  const { requestUrl, fetchChain } = metadata;

  const [queryResults, queryMeta] =
    await db.run(async (sql) => {
      const esc = (s: string) => sql.escape(s);
      const rootUrl = requestUrl;

      // TODO on conflict ...
      const insertValues = _.map(_.tail(fetchChain), l => {
        const resp = l.responseUrl || '';
        const status = `http:${l.status}`;
        return stripMargin(`
|         (
|           ${esc(rootUrl)},
|           ${esc(l.requestUrl)},
|           ${esc(resp)},
|           ${esc(status)},
|           NOW(), NOW()
|           )`);
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

  // prettyPrint({ queryMeta, queryResults });

  await db.close();
}

export interface CorpusEntryStatus {
  entryId: string;
  statusCode: string;
  fields?: string;
}

export async function insertCorpusEntry(url: string): Promise<CorpusEntryStatus> {
  const db = await openDatabase();

  const [queryResults, queryMeta] =
    await db.run(async (sql) => {
      const esc = (s: string) => sql.escape(s);
      const query = stripMargin(`
|       insert into "CorpusEntries" (id, "statusCode")
|         values (
|           encode(digest(${esc(url)} :: bytea, 'sha1'), 'hex'),
|           'new'
|         )
|        on conflict do nothing
|        returning id, "statusCode";
|
|       select * from "CorpusEntries"
|         where id = encode(digest(${esc(url)} :: bytea, 'sha1'), 'hex');
|     `);

      // prettyPrint({ query });
      const results = await sql.query(query);
      return results;
    });

  prettyPrint({ queryMeta, queryResults });
  const response: CorpusEntryStatus[] = queryResults as any[];

  await db.close();
  return response[0];
}
