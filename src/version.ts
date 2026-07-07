// The version is single-sourced from package.json: tsup (builds) and vitest
// (tests) inject it via `define`, so there is no second copy to bump. The
// 'dev' fallback only appears when running source files directly (e.g. tsx).
declare const __NOMBAONE_SDK_VERSION__: string | undefined;

export const VERSION: string =
  typeof __NOMBAONE_SDK_VERSION__ === 'string' ? __NOMBAONE_SDK_VERSION__ : 'dev';
