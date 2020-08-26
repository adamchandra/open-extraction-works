import _ from 'lodash';

import {
  Model,
  Sequelize,
} from 'sequelize';

import { optionalString, primaryKey, primaryKeyString, requiredString } from './db-table-utils';

/**
 *
 *  - (rest) POST alpha-record(s)
 *  - (rest) respond w/ either field data or extraction status
 *  - (spider-scheduler) insert t:(url, status, corpusId) entries
 *  - (spider) scrape urls w/status === unspidered
 *  -   (spider) populate t:(corpusId)
 *  - (field-extractor) insert t:(corpusId, extractionStatus)
 *  -
 *  -
 * ** Usage Scenarios:
 * *** Seeing a faulty extracted abstract and needing to report/correct it
 * *** Viewing overview/stats:
 * ****  # of abstracts available for a reviewer candidate
 * *** Downloading the json with all extracted fields
 * ***
 */



export class AlphaRecord extends Model {
  public id!: number;
  // uniq on compound key noteId+url TODO check this w/Melisa
  public noteId!: string;
  public url!: string;
  public dblpKey!: string;
  public authorId!: string;
  public title!: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static setup(sequelize: Sequelize) {
    AlphaRecord.init({
      id: primaryKey(),
      noteId: requiredString(),
      url: requiredString(),
      dblpKey: requiredString(),
      authorId: optionalString(),
      title: optionalString(),
    }, {
      sequelize,
      timestamps: true
    });
  }
}

export class UrlChain extends Model {
  public url!: string; // Primary Key
  public rootUrl!: string; //
  public responseUrl!: string; // Nullable
  public statusCode!: string; // http:2/4/5xx or spider:lock:xxx or ingestor:new

  public static setup(sequelize: Sequelize) {
    UrlChain.init({
      url: primaryKeyString(),
      rootUrl: requiredString(),
      responseUrl: optionalString(),
      statusCode: requiredString(),
    }, {
      sequelize,
      timestamps: true
    });
  }
}

export class ExtractedField extends Model {
  public id!: number; // PK
  public corpusEntryId!: string;
  public name!: string; // abstract, title, pdfLink, etc..
  public value!: string;

  public static setup(sequelize: Sequelize) {
    ExtractedField.init({
      urlChainId: requiredString(),
      name: requiredString(),
      value: requiredString(),
    }, { sequelize });
  }
}

export function defineTables(sql: Sequelize): void {
  UrlChain.setup(sql);
  AlphaRecord.setup(sql);
  // ExtractedField.setup(sql);
}
