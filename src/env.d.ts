/// <reference types="vite/client" />

// This file is a module so the `jq79` block below augments the package's own types
// instead of replacing them.
export {};

declare module '*.html' {
  import type { Component79 } from 'jq79';
  const component: Component79;
  export default component;
}

declare module 'jq79' {
  /**
   * The reactive store shape jq79 returns. Declared here because the package exposes the
   * type internally but does not re-export it from its entry point.
   */
  export type ReactiveDeepData<T> = T & {
    $on: (dotKey: string, listener: (value: any, dotKey: string) => void, options?: { immediate?: boolean }) => () => void;
    $onAny: (listener: (dotKey: string, value: any) => void, options?: { immediate?: boolean }) => () => void;
    $effect: (run: () => void, options?: { deep?: boolean; alsoWakenBy?: Record<string, any>[] }) => () => void;
    $dispose: () => void;
  };
}
