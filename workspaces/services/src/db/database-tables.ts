import _ from 'lodash';

import {
  DataTypes,
  Model,
  Sequelize,
} from 'sequelize';

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


const primaryKey = () => _.clone({
  type: DataTypes.INTEGER,
  primaryKey: true,
  autoIncrement: true
});

const uniqString = () => _.clone({
  type: DataTypes.STRING,
  allowNull: false,
  unique: true
});

const requiredString = () => _.clone({
  type: DataTypes.STRING,
  allowNull: false,
  unique: false
});

const optionalString = () => _.clone({
  type: DataTypes.STRING,
  allowNull: true,
  unique: false
});

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
  public id!: string; // PrimaryKey, same as corpusId, hash of initial url
  public urlChainId!: string; // same as id iff this is seed url
  public url!: string;


  public static setup(sequelize: Sequelize) {
    UrlChain.init({
      id: primaryKey(),
      urlChainId: requiredString(),
      url: uniqString(),
    }, {
      sequelize,
    });
  }
}

// public httpStatus!: string; // 200/30x/40x
// public spiderStatus!: string; // 'new|crawled'
export class UrlChainLog extends Model {
  public urlChainId!: string; // Primary Key
  public key!: string; // fetch:status, extraction:status
  public body!: string; // <- json record with status,

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static setup(sequelize: Sequelize) {
    UrlChainLog.init({
      urlChainId: requiredString(),
      key: requiredString(),
      body: optionalString(),
    }, {
      sequelize, timestamps: true
    });
  }

}

export class ExtractedField extends Model {
  public urlChainId!: string; // Primary Key
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
  UrlChainLog.setup(sql);
  AlphaRecord.setup(sql);
  ExtractedField.setup(sql);
}
