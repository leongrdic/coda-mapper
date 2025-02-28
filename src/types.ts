export type CodaValues<T> = {
  [K in keyof T extends `_${string}` ? never : keyof T]: T[K];
};
