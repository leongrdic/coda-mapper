import { enforce, getRelation } from './utils';

import type { CodaMapper } from './CodaMapper';
import type { CodaRelation } from './types';

/**
 * Abstract base class representing a table in Coda.
 *
 * This class provides core functionality for tracking state, enforcing types,
 * and proxying property accesses with a sprinkle of magic.
 *
 * @abstract
 * @example
 * ⁣@TableId('table-id')
 * class MyTable extends CodaTable {
 *   id: string;
 *   ⁣@ColumnId('column-id') name: string;
 *   ⁣@ColumnId('column-id') ⁣@Multiple age: number[];
 *   ⁣@ColumnId('column-id') ⁣@References(() => OtherTable) relation: CodaRelation<OtherTable>;
 *   ⁣@ColumnId('column-id') ⁣@References(() => OtherTable) ⁣@Multiple relations: CodaRelation<OtherTable[]>;
 * }
 */
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
                        return item.pull();
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
                        relationArray.push(item.pull());
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

    /**
     * Internal function. Retrieves the current state of the table.
     *
     * @example
     * const state = myTable._getState();
     * console.log(state.existsOnCoda, state.isFetched);
     */
    public _getState() {
        return {
            existsOnCoda: this._state?.existsOnCoda ?? false,
            isFetched: this._state?.isFetched ?? false,
        };
    }

    /**
     * Internal function. Assigns mapper, state, and initial values to the table.
     *
     * @example
     * myTable._assign(mapper, { existsOnCoda: true }, { id: 'row_123', name: 'John' });
     */
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

    /**
     * Pulls (refreshes) the row from Coda.
     *
     * If the row hasn't been inserted to or fetched from Coda, it will throw an error (or at least politely complain).
     *
     * @throws Will throw if the row hasn't been inserted to or fetched from Coda.
     * @example
     * await myTable.pull();
     * console.log('Row refreshed:', myTable);
     */
    public async pull() {
        return enforce(
            this._mapper,
            `Unable to refresh row "${this.id}". This row hasn't been inserted to or fetched from Coda.`
        ).refresh(this);
    }

    /**
     * Pushes (updates) the row in Coda. It only sends dirty values.
     *
     * A way to say, "Hey Coda, here's my latest and greatest version!".
     *
     * @throws Will throw if the row hasn't been inserted to or fetched from Coda.
     * @example
     * await myTable.push();
     * console.log('Row updated!');
     */
    public async push() {
        return enforce(
            this.id && this._mapper,
            `Unable to update row "${this.id}". This row hasn't been inserted to or fetched from Coda.`
        ).update(this);
    }
    /**
     * Pushes the row and waits for the mutation to be confirmed.
     *
     * Because sometimes, patience is a virtue — even when updating data.
     *
     * @throws Will throw if the row hasn't been inserted to or fetched from Coda.
     * @example
     * await myTable.pushAndWait();
     * console.log('Row update confirmed!');
     */
    public async pushAndWait() {
        return enforce(
            this.id && this._mapper,
            `Unable to update row "${this.id}". This row hasn't been inserted to or fetched from Coda.`
        ).waitForMutation(this.push());
    }

    /**
     * Deletes the row from Coda.
     *
     * Removes the row. Even data sometimes needs to go on a vacation (permanently).
     *
     * @throws Will throw if the row hasn't been inserted to or fetched from Coda.
     * @example
     * await myTable.delete();
     * console.log('Row deleted.');
     */
    public async delete() {
        return enforce(
            this.id && this._mapper,
            `Unable to delete row "${this.id}". This row hasn't been inserted to or fetched from Coda.`
        ).delete(this);
    }
    /**
     * Deletes the row and waits for the deletion mutation to be confirmed.
     *
     * A little extra patience for your data deletion needs.
     *
     * @throws Will throw if the row hasn't been inserted to or fetched from Coda.
     * @example
     * await myTable.deleteAndWait();
     * console.log('Row deletion confirmed.');
     */
    public async deleteAndWait() {
        return enforce(
            this.id && this._mapper,
            `Unable to update row "${this.id}". This row hasn't been inserted to or fetched from Coda.`
        ).waitForMutation(this.delete());
    }

    /**
     * Returns true if any of the rows have been changed.
     *
     * @example
     * if (myTable.isDirty()) {
     *   console.log('You have changed some data!');
     * }
     */
    public isDirty() {
        return this._isDirty;
    }

    /**
     * Retrieves a copy of the current values of the row.
     *
     * @example
     * const values = myTable.getValues();
     * console.log(values); // { id: 'row_123', name: 'John' }
     */
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

    /**
     * Internal function. Resets the dirty tracking state.
     * All of the changed values will be considered as original values.
     *
     * @example
     * myTable._resetDirty();
     * console.log(myTable.isDirty()); // false
     */
    public _resetDirty() {
        this._original = { ...this.getValues() };
        this._isDirty = false;
    }

    /**
     * Retrieves a copy of the values that have been modified.
     *
     * @example
     * myTable.name = 'New name';
     * const dirtyValues = myTable.getDirtyValues();
     * console.log(dirtyValues); // { name: 'New name' }
     */
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
