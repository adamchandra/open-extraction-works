import { csvStream } from '~/util/parse-csv';
import pumpify from "pumpify";
import { throughFunc } from '~/util/stream-utils';
import { Stream } from "stream";

// The Initial Record supplied by the OpenReview team
export interface AlphaRecord {
  noteId: string;
  dblpConfId: string;
  url: string;
  title?: string;
  authorId?: string;
}

export function readAlphaRecStream(csvfile: string): Stream {
  const inputStream = csvStream(csvfile);

  return pumpify.obj(
    inputStream,
    throughFunc((csvRec: string[]) => {
      const [noteId, dblpConfId, title, url, authorId] = csvRec;
      return {
        noteId, dblpConfId, url, title, authorId
      };
    }),
  );
}
