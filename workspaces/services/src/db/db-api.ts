import _ from 'lodash';
import * as DB from './db-tables';
import { stripMargin } from 'commons';
import ASync from 'async';
import { openDatabase } from './database';
import { Metadata } from 'spider';
import { AlphaRecord } from 'commons';

export async function insertAlphaRecords(
  inputRecs: AlphaRecord[],
): Promise<DB.AlphaRecord[]> {
  const db = await openDatabase();
  const ins = await db.runTransaction(async (_sql, transaction) => {
    return await ASync.mapSeries<AlphaRecord, DB.AlphaRecord, Error>(
      inputRecs,
      async (rec: AlphaRecord) => {

        const [newEntry, isNew] = await DB.AlphaRecord.findOrCreate({
          where: {
            note_id: rec.noteId,
            url: rec.url,
          },
          defaults: {
            note_id: rec.noteId,
            url: rec.url,
            dblp_key: rec.dblpConfId,
            author_id: rec.authorId,
            title: rec.title,
          },
          transaction,
        });

        return newEntry;
      }
    );
  });
  await db.close();
  return ins;
}

export async function insertNewUrlChains(): Promise<number> {
  const db = await openDatabase();

  const [queryResults,] =
    await db.run(async (sql) => {
      const results = await sql.query(stripMargin(`
|INSERT INTO "UrlChains" (
|  SELECT DISTINCT
|    ar.url AS request_url,
|    null as response_url,
|    'status:new' as status_code,
|    NOW() as "createdAt",
|    NOW() as "updatedAt"
|  FROM "AlphaRecords" ar
|  LEFT JOIN "UrlChains" uc
|  ON ar.url=uc.request_url
|  WHERE uc.request_url IS NULL
|)
|RETURNING request_url
|`));
      return results;
    });

  const updated = queryResults.length;
  // prettyPrint({ queryMeta, queryResults });
  await db.close();
  return updated;
}

export async function getNextUrlForSpidering(): Promise<string | undefined> {
  const db = await openDatabase();
  const [queryResults] =
    await db.run(async (sql) => {
      const results = await sql.query(stripMargin(`
|       UPDATE "UrlChains"
|       SET "status_code" = 'spider:in-progress'
|       WHERE request_url = (
|         SELECT request_url
|         FROM "UrlChains"
|         WHERE "status_code" = 'status:new'
|         LIMIT 1
|       )
|      RETURNING request_url
|      `));
      return results;
    });

  // prettyPrint({ queryResults });
  const results: Array<{ request_url: string }> = queryResults as any;

  await db.close();
  const nextUrl = results.length > 0 ? results[0].request_url : undefined;
  return nextUrl;
}

export interface UrlStatus {
  request_url: string;
  response_url: string;
  status_code: string;
}

export async function commitMetadata(metadata: Metadata): Promise<UrlStatus | undefined> {
  const db = await openDatabase();

  const { requestUrl, responseUrl, status } = metadata;

  const [queryResults] =
    await db.run(async (sql) => {
      const esc = (s: string) => sql.escape(s);
      const httpStatus = `http:${status}`;

      const query = stripMargin(`
|       UPDATE "UrlChains"
|         SET
|           "status_code" = ${esc(httpStatus)},
|           "response_url" = ${esc(responseUrl)},
|           "updatedAt" = NOW()
|         WHERE
|           request_url = ${esc(requestUrl)}
|           AND status_code = 'spider:in-progress'
|         RETURNING "request_url", "response_url", "status_code"
`);

      const results = await sql.query(query);
      return results;
    });

  const response: UrlStatus[] = queryResults as any[];

  await db.close();
  return response[0];
}

// export interface CorpusEntryStatus {
//   entryId: string;
//   statusCode: string;
//   fields?: string;
// }

// export async function insertCorpusEntry(url: string): Promise<CorpusEntryStatus> {
//   const db = await openDatabase();

//   const [queryResults, queryMeta] =
//     await db.run(async (sql) => {
//       const esc = (s: string) => sql.escape(s);
//       const query = stripMargin(`
// |       insert into "CorpusEntries" (id, "statusCode")
// |         values (
// |           encode(digest(${esc(url)} :: bytea, 'sha1'), 'hex'),
// |           'new'
// |         )
// |        on conflict do nothing
// |        returning id, "statusCode";
// |
// |       select * from "CorpusEntries"
// |         where id = encode(digest(${esc(url)} :: bytea, 'sha1'), 'hex');
// |     `);

//       // prettyPrint({ query });
//       const results = await sql.query(query);
//       return results;
//     });

//   prettyPrint({ queryMeta, queryResults });
//   const response: CorpusEntryStatus[] = queryResults as any[];

//   await db.close();
//   return response[0];
// }
