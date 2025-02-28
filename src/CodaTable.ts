export abstract class CodaTable {
  abstract id: string;
  private _original = {};
  private _isDirty: boolean = false;
  constructor() {
    return new Proxy(this, {
      set: (target, prop, value) => {
        if (!Object.hasOwn(this._original, prop)) {
          this._isDirty = true;
        } else if (
          target[prop as keyof typeof target] !==
          this._original[prop as keyof typeof this._original]
        ) {
          this._isDirty = true;
        }
        target[prop as keyof typeof target] = value;
        return true;
      },
    });
  }

  public isDirty() {
    return this._isDirty;
  }

  public getValues(): {
    [K in keyof this as this[K] extends Function
      ? never
      : K extends `_${string}`
      ? never
      : K]: this[K];
  } {
    const values = {} as typeof this;
    for (const key of Object.keys(this)) {
      if (
        !key.startsWith("_") &&
        typeof this[key as keyof this] !== "function"
      ) {
        values[key as keyof this] = this[key as keyof this];
      }
    }
    return values as this;
  }

  public getDirtyValues(): {
    [K in keyof this as this[K] extends Function
      ? never
      : K extends `_${string}`
      ? never
      : K]?: this[K];
  } {
    const values = this.getValues();
    const dirtyValues = {} as typeof this;
    for (const key of Object.keys(values)) {
      if (
        !Object.hasOwn(this._original, key) ||
        values[key as keyof typeof values] !==
          this._original[key as keyof typeof this._original]
      ) {
        dirtyValues[key as keyof this] = this[key as keyof this];
      }
    }
    return dirtyValues;
  }
}
