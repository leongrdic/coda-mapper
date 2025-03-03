export abstract class CodaTable {
    abstract readonly id: string;
    private _original = {};
    private _isDirty: boolean = false;
    [key: string]: any;
    constructor() {
        if (new.target === CodaTable) {
            throw new Error(
                'You cannot instantiate CodaTable directly. Please extend it.'
            );
        }
        return new Proxy(this, {
            set: (target, prop, value) => {
                if (!Object.hasOwn(this._original, prop)) {
                    this._isDirty = true;
                } else if (Array.isArray(value)) {
                    for (let i = 0; i < value.length; i++) {
                        if (
                            value[i] !==
                            (this._original[
                                prop as keyof typeof this._original
                            ] ?? [])[i]
                        ) {
                            this._isDirty = true;
                            break;
                        }
                    }
                } else if (
                    value !==
                    this._original[prop as keyof typeof this._original]
                ) {
                    this._isDirty = true;
                }
                target[prop as keyof typeof target] = value;
                if (Object.keys(this.getDirtyValues()).length === 0) {
                    this._isDirty = false;
                }
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
                !key.startsWith('_') &&
                typeof this[key as keyof this] !== 'function'
            ) {
                values[key as keyof this] = this[key as keyof this];
            }
        }
        return values as this;
    }

    public resetDirty() {
        this._original = { ...this.getValues() };
        this._isDirty = false;
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
            if (!Object.hasOwn(this._original, key)) {
                dirtyValues[key as keyof this] = this[key as keyof this];
            } else if (Array.isArray(values[key as keyof typeof values])) {
                for (
                    let i = 0;
                    i <
                    (values[key as keyof typeof values] as Array<this>).length;
                    i++
                ) {
                    if (
                        (values[key as keyof typeof values] as Array<this>)[
                            i
                        ] !==
                        (this._original[key as keyof typeof this._original] ??
                            [])[i]
                    ) {
                        dirtyValues[key as keyof this] =
                            this[key as keyof this];
                        break;
                    }
                }
            } else if (
                values[key as keyof typeof values] !==
                this._original[key as keyof typeof this._original]
            ) {
                dirtyValues[key as keyof this] = this[key as keyof this];
            }
        }
        return dirtyValues;
    }
}
