// A3 item 6: minimal ambient types for `bun test` files so `tsc --noEmit -p tsconfig.test.json` can check them
// without adding a dependency (no bun-types / @types/bun). Matchers stay loose on purpose (`expect` → any);
// everything else in a test (fixtures, helpers, app imports) is checked strictly.
declare module "bun:test" {
  type Body = (...args: any[]) => unknown;
  interface TestFn {
    (name: string, fn: Body, options?: number | { timeout?: number; retry?: number }): void;
    skip: TestFn;
    only: TestFn;
    todo: TestFn;
    failing: TestFn;
    skipIf(condition: unknown): TestFn;
    if(condition: unknown): TestFn;
    todoIf(condition: unknown): TestFn;
    each(table: readonly unknown[]): (name: string, fn: Body, options?: number) => void;
  }
  interface DescribeFn {
    (name: string, fn: () => void): void;
    skip: DescribeFn;
    only: DescribeFn;
    todo: DescribeFn;
    skipIf(condition: unknown): DescribeFn;
    if(condition: unknown): DescribeFn;
    each(table: readonly unknown[]): (name: string, fn: Body) => void;
  }
  export const test: TestFn;
  export const it: TestFn;
  export const describe: DescribeFn;
  export const expect: any;
  export function beforeAll(fn: Body, timeout?: number): void;
  export function afterAll(fn: Body, timeout?: number): void;
  export function beforeEach(fn: Body, timeout?: number): void;
  export function afterEach(fn: Body, timeout?: number): void;
  export const mock: any;
  export const spyOn: any;
  export const jest: any;
  export function setSystemTime(now?: Date | number): void;
}

declare var Bun: any;

interface ImportMeta {
  readonly dir: string;
  readonly dirname: string;
  readonly path: string;
  readonly file: string;
  readonly main: boolean;
}
