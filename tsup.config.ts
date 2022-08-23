import { defineConfig } from 'tsup'

export default defineConfig({
  entryPoints: [
    'src/index.ts', 
    'src/client/provider.ts', 
    'src/server/server.ts'
  ],
  outDir: 'dist',
  format: ['esm', 'cjs'],
  tsconfig: './tsconfig.json',
  target: 'es2018',
  minify: false,
  minifySyntax: true,
  minifyWhitespace: false,
  minifyIdentifiers: true,
  sourcemap: true,
  clean: true,
  dts: true,
})