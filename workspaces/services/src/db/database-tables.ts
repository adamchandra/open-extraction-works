import _ from 'lodash';

import {
  DataTypes,
  Model,
  Sequelize,
  Association,
} from 'sequelize';

export class Url extends Model {
  public id!: number;
  public url!: string;
}

export class DblpId extends Model {
  public id!: number;
  public dplpId!: string;
}

export class NoteId extends Model {
  public id!: number;
  public noteId!: string;
}

export class AlphaRequest extends Model {
  public id!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static associations: {
    orderEntries: Association<AlphaRequest, AlphaRecord>;
  };
}

export class AlphaRecord extends Model {
  public id!: number;
  public alphaRequest!: number;
  public url!: number;
  public dblpId!: number;
  public note!: number;
  public authorId!: number;
  public title!: number;
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

  const url = {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  };

  Url.init({ id: primaryKey, url }, opts);
  DblpId.init({
    id: primaryKey,
    dplpId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    }
  }, opts);

  NoteId.init({
    id: primaryKey,
    noteId: { type: DataTypes.STRING, allowNull: false, unique: true },
  }, opts);

  AlphaRequest.init({ id: primaryKey }, opts);

  AlphaRecord.init({
    id: primaryKey,
    order: { type: DataTypes.INTEGER },
    url: { type: DataTypes.INTEGER },
    venue: { type: DataTypes.INTEGER },
    note: { type: DataTypes.INTEGER },
    // source: { type: DataTypes.JSON },
  }, opts);


  // Order.hasMany(OrderEntry, {
  //   sourceKey: 'id',
  //   foreignKey: 'order',
  //   as: 'entries',
  // });
  // OrderEntry.belongsTo(Order)
}
