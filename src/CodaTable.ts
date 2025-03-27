import { enforce, getRelation } from './utils';

import type { CodaMapper } from './CodaMapper';
import type { CodaRelation } from './types';

export abstract class CodaTable {
    abstract id: string;
    public _original = {};
    private _isDirty: boolean = false;
    private _mapper: CodaMapper;
    private _state = {
        existsOnCoda: false,
        isFetched: false,
    };
    constructor() {
        enforce(
            new.target !== CodaTable,
            'You cannot instantiate CodaTable directly. Please extend it.'
        );
        return new Proxy(this, {
            get: (target, prop, receiver) => {
                const relation = getRelation(this, String(prop));
                if (String(prop).startsWith('_direct_')) {
                    return Reflect.get(target, String(prop).substring(8), receiver);
                }
                if (
                    !relation ||
                    target[String(prop) as keyof this] === undefined ||
                    (Array.isArray(target[String(prop) as keyof this]) &&
                        (target[String(prop) as keyof this] as Array<CodaTable>).length === 0)
                ) {
                    return Reflect.get(target, prop, receiver);
                }
                if (!Array.isArray(target[String(prop) as keyof this])) {
                    const item = target[String(prop) as keyof this] as CodaTable;
                    enforce(
                        item instanceof relation,
                        `Expected ${relation.name} but got ${item.constructor.name}`
                    );
                    const itemState = item._getState();
                    if (itemState.existsOnCoda && !itemState.isFetched) {
                        return item.refresh();
                    }
                    return item;
                }
                const relationArray: Array<CodaTable | Promise<CodaTable>> = [];
                for (const item of target[String(prop) as keyof this] as Array<CodaTable>) {
                    enforce(
                        item instanceof relation,
                        `Expected ${relation.name} but got ${item.constructor.name}`
                    );
                    const itemState = item._getState();
                    if (itemState.existsOnCoda && !itemState.isFetched) {
                        relationArray.push(item.refresh());
                    } else {
                        relationArray.push(item);
                    }
                }
                if (relationArray.some((item) => item instanceof Promise)) {
                    return Promise.all(relationArray) as Promise<CodaTable[]>;
                }
                return relationArray;
            },
            set: (target, prop, value) => {
                let dirty = false;
                if (!String(prop).startsWith('_')) {
                    const relation = getRelation(this, String(prop));
                    if (relation) {
                        if (Array.isArray(value)) {
                            for (const item of value) {
                                enforce(
                                    item instanceof relation,
                                    `Expected ${relation.name} but got ${item.constructor.name}`
                                );
                            }
                        } else if (value) {
                            enforce(
                                value instanceof relation,
                                `Expected ${relation.name} but got ${value.constructor.name}`
                            );
                        }
                    }
                    if (!Object.hasOwn(this._original, prop)) {
                        dirty = true;
                    } else if (Array.isArray(value)) {
                        for (let i = 0; i < value.length; i++) {
                            if (
                                value[i] !==
                                (this._original[prop as keyof typeof this._original] ?? [])[i]
                            ) {
                                dirty = true;
                                break;
                            }
                        }
                    } else if (value !== this._original[prop as keyof typeof this._original]) {
                        dirty = true;
                    }
                }
                target[prop as keyof typeof target] = value;
                if (Object.keys(this.getDirtyValues()).length === 0) {
                    dirty = false;
                }
                target['_isDirty'] = dirty;
                return true;
            },
        });
    }

    public _getState() {
        return {
            existsOnCoda: this._state?.existsOnCoda ?? false,
            isFetched: this._state?.isFetched ?? false,
        };
    }
    public _assign(
        mapper: CodaMapper,
        state: { existsOnCoda?: boolean; isFetched?: boolean },
        values: Partial<this> = {}
    ) {
        this._mapper = mapper;
        this._state = { ...this._state, ...state };
        for (const key of Object.keys(values)) {
            this[key as keyof this] = values[key as keyof this] as this[keyof this];
        }
        this._resetDirty();
    }

    public async refresh() {
        return enforce(
            this._mapper,
            `Unable to refresh row "${this.id}". This row hasn't been inserted to or fetched from Coda.`
        ).refresh(this);
    }

    public async update() {
        return enforce(
            this.id && this._mapper,
            `Unable to update row "${this.id}". This row hasn't been inserted to or fetched from Coda.`
        ).update(this);
    }
    public async updateAndWait() {
        return enforce(
            this.id && this._mapper,
            `Unable to update row "${this.id}". This row hasn't been inserted to or fetched from Coda.`
        ).waitForMutation(this.update());
    }

    public async delete() {
        return enforce(
            this.id && this._mapper,
            `Unable to delete row "${this.id}". This row hasn't been inserted to or fetched from Coda.`
        ).delete(this);
    }
    public async deleteAndWait() {
        return enforce(
            this.id && this._mapper,
            `Unable to update row "${this.id}". This row hasn't been inserted to or fetched from Coda.`
        ).waitForMutation(this.delete());
    }

    public isDirty() {
        return this._isDirty;
    }

    public getValues() {
        const values = {} as typeof this;
        for (const key of Object.keys(this)) {
            if (!key.startsWith('_')) {
                values[key as keyof this] = this[`_direct_${key}` as keyof this];
            }
        }
        return values as {
            [K in keyof this as this[K] extends Function
                ? never
                : K extends `_${string}`
                  ? never
                  : K]: this[K] extends CodaRelation<infer U> ? U : this[K];
        };
    }

    public _resetDirty() {
        this._original = { ...this.getValues() };
        this._isDirty = false;
    }

    public getDirtyValues() {
        const values = this.getValues();
        const dirtyValues = {} as typeof this;
        for (const key of Object.keys(values)) {
            if (!Object.hasOwn(this._original, key)) {
                dirtyValues[key as keyof this] = this[`_direct_${key}` as keyof this];
            } else if (Array.isArray(values[key as keyof typeof values])) {
                for (
                    let i = 0;
                    i < (values[key as keyof typeof values] as Array<this>).length;
                    i++
                ) {
                    if (
                        (values[key as keyof typeof values] as Array<this>)[i] !==
                        (this._original[key as keyof typeof this._original] ?? [])[i]
                    ) {
                        dirtyValues[key as keyof this] = this[`_direct_${key}` as keyof this];
                        break;
                    }
                }
            } else if (
                values[key as keyof typeof values] !==
                this._original[key as keyof typeof this._original]
            ) {
                dirtyValues[key as keyof this] = this[`_direct_${key}` as keyof this];
            }
        }
        return dirtyValues as {
            [K in keyof this as this[K] extends Function
                ? never
                : K extends `_${string}`
                  ? never
                  : K]?: this[K] extends CodaRelation<infer U> ? U : this[K];
        };
    }
}
