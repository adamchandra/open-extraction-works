import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import tsConfigPaths from 'rollup-plugin-ts-paths';
import pkg from './package.json';
import json from '@rollup/plugin-json';

export default {
  input: 'src/cli/index.ts',
  plugins: [
    json(),
    resolve({
      rootDir: process.cwd()
    }),
    commonjs({
      include: /node_modules/
    }),
    tsConfigPaths(),
    typescript({
      typescript: require('typescript')
    }),
  ],

  output: [
    { file: pkg.main, format: 'cjs' },
    { file: pkg.module, format: 'es' }
  ],

  external: [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    'path', 'util', 'stream', 'os', 'tty', 'events', 'buffer', 'child_process'
  ],
};

