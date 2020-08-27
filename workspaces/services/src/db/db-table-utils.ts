import _ from 'lodash';

import {
  DataTypes,
} from 'sequelize';

export const primaryKey = () => _.clone({
  type: DataTypes.INTEGER,
  primaryKey: true,
  autoIncrement: true
});

export const primaryKeyString = () => _.clone({
  type: DataTypes.STRING,
  allowNull: false,
  primaryKey: true,
  unique: true
});

// defaultValue = ''
export const uniqString = () => _.clone({
  type: DataTypes.STRING,
  allowNull: false,
  unique: true
});

export const requiredString = () => _.clone({
  type: DataTypes.STRING,
  allowNull: false,
  unique: false
});

export const optionalString = () => _.clone({
  type: DataTypes.STRING,
  allowNull: true,
  unique: false
});
