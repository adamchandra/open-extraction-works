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

export class VenueUrl extends Model {
  public id!: number;
  public url!: string;
}

export class NoteId extends Model {
  public id!: number;
  public noteId!: string;
}

export class Order extends Model {
  public id!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static associations: {
    orderEntries: Association<Order, OrderEntry>;
  };
}

export class OrderEntry extends Model {
  public id!: number;
  public order!: number;
  public url!: number;
  public venue!: number;
  public note!: number;
  // public source!: string; // the original record as provided by the openreview team (csv record)
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
  VenueUrl.init({ id: primaryKey, url }, opts);

  NoteId.init({
    id: primaryKey,
    noteId: { type: DataTypes.STRING, allowNull: false, unique: true },
  }, opts);

  Order.init({ id: primaryKey }, opts);

  OrderEntry.init({
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
