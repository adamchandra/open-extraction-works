import _ from "lodash";

export type ObjectPath = string[];
type ObjectPathAndPrimitive = Readonly<[ObjectPath, string, any]>;
type ObjectPathOnly = Readonly<[ObjectPath, string]>;
export type ObjectPathWithValue = ObjectPathAndPrimitive | ObjectPathOnly;


export interface PathPart {
  key: string;
  n: number;
  sibs: number;
  pathType: string;
}

export type PathParts = PathPart[];
export type QualifiedKey = Readonly<[PathParts]>;
export type QualifiedKeyValue = Readonly<[PathParts, any]>;
export type QualifiedPath = QualifiedKey | QualifiedKeyValue;


export function isQualifiedKey(qp: QualifiedPath): qp is QualifiedKey {
  return qp.length === 1;
}

export function isQualifiedKeyValue(qp: QualifiedPath): qp is QualifiedKeyValue {
  return qp.length === 2;
}


export function toObjectPath(qp: QualifiedPath): string[] {
  return _.map(qp[0], p => p.key);
}

type ArgType = any;

/**
 * Recursively gather all paths and values in an object
 */
export function toQualifiedPaths(obj: ArgType): QualifiedPath[] {

  function _loop(
    subobj: any,
    parentPath: PathParts
  ): QualifiedPath[] {

    if (_.isArray(subobj)) {
      const subPaths = _.flatMap(subobj, (entry, i) => {
        const pathPart: PathPart = {
          key: i.toString(),
          n: i,
          sibs: subobj.length,
          pathType: 'array'
        };
        const subPath = _.concat(parentPath, pathPart);
        return _loop(entry, subPath);
      });

      return _.concat([[parentPath]], subPaths)
    }

    if (_.isObject(subobj)) {
      const kvs = _.toPairs(subobj);
      const subPaths = _.flatMap(kvs, ([k, v], i) => {
        const pathPart: PathPart = {
          key: k,
          n: i,
          sibs: kvs.length,
          pathType: 'object'
        };
        const subPath = _.concat(parentPath, pathPart);
        return _loop(v, subPath);
      });
      return _.concat([[parentPath]], subPaths)
    }
    return [[parentPath, subobj]];
  }

  return _loop(obj, []).slice(1);
}
