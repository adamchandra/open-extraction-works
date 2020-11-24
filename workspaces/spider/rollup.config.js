import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import pkg from './package.json';
import rootPkg from '../../package.json';

export default [
	{
		input: 'src/index.ts',
		plugins: [
      resolve({
        // rootDir: path.join(process.cwd(), '../..')
        rootDir: process.cwd()
      }),
      commonjs({
        include: /node_modules/
      }),
      typescript({
        typescript: require('typescript'),
      }),
		],

		output: [
			{ file: pkg.main, format: 'cjs' },
			{ file: pkg.module, format: 'es' }
    ],

    external: [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
      ...Object.keys(rootPkg.dependencies || {}),
      ...Object.keys(rootPkg.peerDependencies || {}),
      'path', 'util', 'stream', 'os', 'tty', 'events', 'buffer'
    ],
	}

];
