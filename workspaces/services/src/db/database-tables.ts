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

const primaryKeyString = () => _.clone({
  type: DataTypes.STRING,
  allowNull: false,
  primaryKey: true,
  unique: true
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

// All URLs known in the system are recorded here
export class UrlQueue extends Model {
  public url!: string;

  public static setup(sequelize: Sequelize) {
    UrlQueue.init({
      url: uniqString(),
    }, { sequelize });
  }
}


export class UrlChain extends Model {
  public id!: string; // PrimaryKey, same as corpusId, hash of initial url
  public chainRoot!: string;
  public requestUrl!: string;
  public responseUrl!: string;
  public httpStatus!: string;

  public static setup(sequelize: Sequelize) {
    UrlChain.init({
      id: primaryKeyString(),
      urlChainId: requiredString(),
      url: uniqString(),
    }, { sequelize });
  }
}

export class CorpusEntry extends Model {
  public id!: string;

  public static setup(sequelize: Sequelize) {
    CorpusEntry.init({
    }, { sequelize });
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
  ExtractedField.setup(sql);
}
