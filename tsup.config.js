import { defineConfig } from 'tsup';

export default defineConfig([
    {
        entry: ['src/**/*.ts'],
        format: 'esm',
        outDir: 'dist/esm',
        sourcemap: true,
        clean: true,
        dts: { resolve: true },
        outExtension: () => ({ js: '.js', dts: '.d.ts' }),
        esbuildOptions(options) {
            options.outbase = 'src';
            options.alias = { '@': './src' };
        },
    },
    {
        entry: ['src/**/*.ts'],
        format: 'cjs',
        outDir: 'dist/cjs',
        sourcemap: true,
        clean: false,
        dts: false,
        outExtension: () => ({ js: '.js' }),
        esbuildOptions(options) {
            options.outbase = 'src';
            options.alias = { '@': './src' };
        },
    }
]);
