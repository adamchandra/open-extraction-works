import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import pkg from './package.json';

// import rootPkg from '../../package.json';
// import tsConfigPaths from 'rollup-plugin-ts-paths';
// import json from '@rollup/plugin-json';
let tsconfigOverrides = { compilerOptions: { module: 'esnext' } };

export default [
  {
    input: 'src/cli/index.ts',
    plugins: [
      // json(),
      resolve({
        rootDir: process.cwd()
      }),
      commonjs({
        include: /node_modules/
      }),
      // tsConfigPaths(),
      typescript({
        typescript: require('typescript'),
        tsconfig: 'tsconfig.json',
        tsconfigOverride: tsconfigOverrides
      }),
    ],

    output: [
      { file: pkg.main, format: 'cjs' }
    ],

    external: [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
      'path', 'util', 'stream', 'os', 'tty', 'events', 'buffer', 'child_process'
    ]
  }
];
