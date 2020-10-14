import 'chai';

import _ from 'lodash';
import { prettyPrint } from './pretty-print';

import {
  createRadix,
  radUpsert,
  radInsert,
  radTraverseValues,
} from './radix-tree';

describe('Radix Tree Tests', () => {
  interface Foo {
    s: string;
    i: number;
  }

  it('should create and traverse a tree', () => {
    const radTree = createRadix<Foo>();

    expect(radTree).toMatchObject({});

    radInsert(radTree, 'a.$.12._$.b', { s: 'hey', i: 25 });

    expect(radTree).toMatchObject({
      a: { $: { _12: { __$: { b: { _$: { i: 25, s: 'hey' } } } } } },
    });

    radUpsert(radTree, 'a.$.12._$.b', prev => {
      return prev ? { ...prev, s: 'hey yourself' } : { i: 42, s: 'hey yourself' };
    });

    expect(radTree).toMatchObject({
      a: {
        $: { _12: { __$: { b: { _$: { i: 25, s: 'hey yourself' } } } } },
      },
    });

    radUpsert(radTree, 'a.blah.b', prev => {
      return prev ? { ...prev, s: 'child data' } : { i: 103, s: 'new blah data' };
    });

    expect(radTree).toMatchObject({
      a: {
        $: { _12: { __$: { b: { _$: { i: 25, s: 'hey yourself' } } } } },
        blah: { b: { _$: { i: 103, s: 'new blah data' } } },
      },
    });
  });

  it('should traverse the tree', () => {
    const nodes: Array<[string, Foo]> = [
      ['', { s: 'zero', i: 0 }],
      ['a', { s: 'a-str', i: 99 }],
      ['a.b', { s: 'one', i: 1 }],
      ['a.00.$', { s: 'two', i: 2 }],
      ['a.00.d', { s: 'three', i: 3 }],
      // ['a.i.j.3', {s: 'four', i: 4}],
    ];
    const o = {};

    _.each(nodes, ([p, d]) => radInsert(o, p, d));

    prettyPrint({ o });

    radTraverseValues(o, (path, tval) => {
      prettyPrint({ path, tval });
    });
  });
});
