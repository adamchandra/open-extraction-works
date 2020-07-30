import _ from 'lodash';

import {
  DataTypes,
  Model,
  Sequelize,
} from 'sequelize';

import { AlphaRecord as AlphaRecordData } from 'commons';
/**
 *
 *  - (rest) raw upload csv
 *  - (rest) respond w/ endpoints for status/download
 *  - (spider-scheduler) insert t:(url, status, corpusId) entries
 *  - (spider) scrape urls w/status === unspidered
 *  -   (spider) populate t:(corpusId)
 *  - (field-extractor) insert t:(corpusId, extractionStatus)
 *  -
 *  -
 * ** Usage Scenarios:
 * *** Initial upload of csv
 * *** Adding a few new entries to uploaded CSV
 * *** Seeing a faulty extracted abstract and needing to report/correct it
 * *** Viewing overview/stats:
 * ****  # of abstracts available for a reviewer candidate
 * *** Downloading the json with all extracted fields
 * ***
 */
export class AlphaRecord extends Model {
  public id!: number;
  public alphaRequest!: number;
  public url!: number;
  public dblpId!: number;
  public note!: number;
  public authorId!: string;
  public title!: string;
}

export class Url extends Model {
  public id!: number;
  public url!: string;
}

export class DblpId extends Model {
  public id!: number;
  public dblpId!: string;
}

export class NoteId extends Model {
  public id!: number;
  public noteId!: string;
}

export class AlphaUpload extends Model {
  public id!: number;
  public rawUpload!: AlphaRecordData[];
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

export class AlphaRequest extends Model {
  public id!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}


export function defineTables(sql: Sequelize): void {
  const opts = {
    sequelize: sql,
    timestamps: true,
  };

  const primaryKey = {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  };

  const uniqString = {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  };

  const optionalString = {
    type: DataTypes.STRING,
    allowNull: true,
    unique: false
  };

  const foreignPKey = {
    type: DataTypes.INTEGER,
  };

  Url.init({
    id: primaryKey,
    url: uniqString
  }, opts);

  DblpId.init({
    id: primaryKey,
    dblpId: uniqString,
  }, opts);

  NoteId.init({
    id: primaryKey,
    noteId: uniqString,
  }, opts);

  AlphaUpload.init({
    id: primaryKey,
    rawUpload: { type: DataTypes.JSON, allowNull: false },
  }, opts);

  AlphaRequest.init({
    id: primaryKey,
  }, opts);

  AlphaRecord.init({
    id: primaryKey,
    alphaRequest: foreignPKey,
    url: foreignPKey,
    dblpId: foreignPKey,
    note: foreignPKey,
    authorId: optionalString,
    title: optionalString,
  }, opts);

  AlphaRequest.hasOne(AlphaUpload);
  AlphaUpload.belongsTo(AlphaRequest);
  AlphaRecord.hasOne(Url);
  AlphaRecord.hasOne(DblpId);
  AlphaRecord.hasOne(NoteId);
  AlphaRecord.belongsTo(AlphaRequest);
  AlphaRequest.hasMany(AlphaUpload);

  // Order.hasMany(OrderEntry, {
  //   sourceKey: 'id',
  //   foreignKey: 'order',
  //   as: 'entries',
  // });
  // OrderEntry.belongsTo(Order)
}
