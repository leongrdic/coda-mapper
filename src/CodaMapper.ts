import { CodaTable } from './CodaTable';
import {
    delay,
    enforce,
    getColumnId,
    getMultiple,
    getRelation,
    getTableId,
    parseJson,
} from './utils';

import type {
    CodaDeleteResponse,
    CodaDeleteRowsRequest,
    CodaGetRowQuery,
    CodaGetRowsQuery,
    CodaInsertResponse,
    CodaMutationStatusResponse,
    CodaPostRowsRequest,
    CodaPutRowRequest,
    CodaRow,
    CodaRowResponse,
    CodaRowValue,
    CodaRowsResponse,
    CodaUpdateResponse,
    CodaUpsertResponse,
    RecursiveHelper,
} from './types';

export class CodaMapper {
    private readonly baseUrl = 'https://coda.io/apis/v1';
    constructor(
        private readonly docId: string,
        private readonly apiKey: string
    ) {
        enforce(docId, 'docId is required');
        enforce(apiKey, 'apiKey is required');
    }

    private cache: Map<`${string}:${string}`, CodaTable> = new Map();
    public _getCache() {
        return this.cache;
    }
    public _clearCache() {
        this.cache.clear();
    }

    private fetch<R>(url: string, options: RequestInit = {}) {
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${this.apiKey}`);
        return parseJson<R>(fetch(url, { ...options, headers }));
    }

    private readonly api = {
        get: <R, Q>(url: string, params?: Q, options?: RequestInit) =>
            this.fetch<R>(
                `${url}?${new URLSearchParams({
                    ...params,
                    valueFormat: 'rich',
                }).toString()}`,
                {
                    method: 'GET',
                    ...options,
                }
            ),
        post: <R, B>(url: string, body?: B, options?: RequestInit) =>
            this.fetch<R>(url, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    'Content-Type': 'application/json',
                },
                ...options,
            }),
        put: <R, B>(url: string, body?: B, options?: RequestInit) =>
            this.fetch<R>(url, {
                method: 'PUT',
                body: JSON.stringify(body),
                headers: {
                    'Content-Type': 'application/json',
                },
                ...options,
            }),
        delete: <R, B>(url: string, body?: B, options?: RequestInit) =>
            this.fetch<R>(url, {
                method: 'DELETE',
                body: JSON.stringify(body),
                headers: {
                    'Content-Type': 'application/json',
                },
                ...options,
            }),
    };

    private parseDtoRow<R extends CodaTable>(
        table: new (...args: ConstructorParameters<typeof CodaTable>) => R,
        dtoRow: CodaRow
    ) {
        const row = new table(this, { existsOnCoda: true, isFetched: true });
        for (const prop of Object.keys(row.getValues())) {
            if (prop === 'id') continue;
            const columnId = enforce(
                getColumnId(table, prop),
                `@ColumnId not set for property "${prop}" in class ${table.name}`
            );
            const relation = getRelation(table, prop);
            const multiple = getMultiple(table, prop);
            const parsedValue = !dtoRow.values[columnId]
                ? undefined
                : this.decodeRichValue(
                      dtoRow.values[columnId],
                      relation,
                      multiple,
                      table.name,
                      prop
                  );
            row[prop as keyof R] = parsedValue as R[keyof R];
        }
        row.id = dtoRow.id;
        row._resetDirty();
        const cachedRow = this.cache.get(`${getTableId(table)}:${dtoRow.id}`);
        if (cachedRow) {
            Object.assign(cachedRow, row);
            return cachedRow as R;
        }
        this.cache.set(`${getTableId(table)}:${dtoRow.id}`, row);
        return row;
    }
    private decodeRichValue(
        value: CodaRowValue,
        relation?: new (...args: ConstructorParameters<typeof CodaTable>) => CodaTable,
        multiple?: boolean,
        className?: string,
        keyName?: string
    ): RecursiveHelper<string | number | boolean | CodaTable> {
        if (typeof value === 'string') {
            if (multiple && value === '') return [];
            if (value.startsWith('```') && value.endsWith('```')) {
                value = value.substring(3, value.length - 3);
            }
            return value.replace(/\\`/g, '`');
        } else if (Array.isArray(value)) {
            return value.map((v) => this.decodeRichValue(v, relation, false, className, keyName));
        } else if (!Array.isArray(value) && multiple) {
            return [this.decodeRichValue(value, relation, false, className, keyName)];
        } else if (typeof value === 'object') {
            if (value['@type'] === 'StructuredValue') {
                const cachedRow = this.cache.get(`${value.tableId}:${value.rowId}`);
                if (cachedRow) return cachedRow;
                const table = new (enforce(
                    relation,
                    `@RelatedTable not set for row "${keyName}" on table ${className}.`
                ))(this, { existsOnCoda: true });
                table.id = value.rowId;
                this.cache.set(`${value.tableId}:${value.rowId}`, table);
                return table;
            } else if (value['@type'] === 'MonetaryAmount') return value.amount;
            else if (value['@type'] === 'WebPage') return value.url;
            else if (value['@type'] === 'ImageObject') return value.url;
            else if (value['@type'] === 'Person') return value.email;
        }
        return value;
    }
    private parseCodaRow<R extends CodaTable>(
        row: R,
        includeColumns: Exclude<
            {
                [K in keyof R]: R[K] extends Function ? never : K;
            }[keyof R],
            `_${string}`
        >[] = []
    ) {
        const values = row.getValues();
        const dirtyValues = row.getDirtyValues();
        const sentValues = Object.keys(values).reduce<
            Record<string, RecursiveHelper<string | number | boolean | CodaTable>>
        >((acc, key) => {
            if (
                key in dirtyValues ||
                includeColumns.includes(key as (typeof includeColumns)[number])
            ) {
                if (
                    key !== 'id' ||
                    includeColumns.includes('id' as (typeof includeColumns)[number])
                ) {
                    acc[key] = values[key as keyof typeof values] as RecursiveHelper<
                        string | number | boolean | CodaTable
                    >;
                }
            }
            return acc;
        }, {});
        const cells = Object.entries(sentValues).map(([key, value]) => ({
            column: enforce(
                getColumnId(row.constructor as new () => R, key),
                `@ColumnId not set for property "${key}" in class ${row.constructor.name}`
            ),
            value: this.encodeValue(
                value as RecursiveHelper<string | number | boolean | CodaTable>
            ),
        }));
        return { cells };
    }
    private encodeValue(
        column: RecursiveHelper<string | number | boolean | CodaTable>
    ): RecursiveHelper<string | number | boolean> {
        if (column instanceof CodaTable) {
            return column.id;
        } else if (Array.isArray(column)) {
            return column.map((c) => this.encodeValue(c));
        }
        return column;
    }

    private async getMutationStatus(requestId: string) {
        const url = `${this.baseUrl}/mutationStatus/${requestId}`;
        return this.api.get<CodaMutationStatusResponse, object>(url);
    }
    public async waitForMutation<
        PR extends Promise<
            CodaInsertResponse | CodaUpsertResponse | CodaUpdateResponse | CodaDeleteResponse
        >,
    >(codaRequest: PR, delayTime: number = 5000) {
        const response = await codaRequest;
        let completed = false;
        while (!completed) {
            await delay(delayTime);
            completed = (await this.getMutationStatus(response.requestId)).completed;
        }
        return response;
    }

    public async refresh<R extends CodaTable>(row: R) {
        const id = enforce(
            row.id,
            `Unable to refresh row "${row.id}". This row hasn't been inserted to or fetched from Coda.`
        );
        const newRow = enforce(
            await this.get(row.constructor as new () => R, id),
            `Refreshing row "${row.id}" on table ${row.constructor.name} returned null`
        );
        Object.assign(row, newRow);
        return row;
    }

    public async get<T extends CodaTable>(table: new () => T, id: string): Promise<T | null> {
        const tableId = enforce(getTableId(table), `@TableId not set for class ${table.name}`);
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows/${id}`;
        const response = await this.api.get<CodaRowResponse, CodaGetRowQuery>(url);
        return this.parseDtoRow(table, response);
    }

    public async find<R extends CodaTable>(
        table: new () => R,
        property: Exclude<
            {
                [K in keyof R]: R[K] extends Function ? never : K;
            }[keyof R],
            `_${string}` | 'id'
        >,
        value: string
    ): Promise<R[]> {
        const tableId = enforce(getTableId(table), `@TableId not set for class ${table.name}`);
        const columnId = enforce(
            getColumnId(table, String(property)),
            `@ColumnId not set for property ${String(property)} in class ${table.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows`;
        const response = await this.api.get<CodaRowsResponse, CodaGetRowsQuery>(url, {
            query: `"${columnId}":${JSON.stringify(value)}`,
        });
        return response.items.map((row) => this.parseDtoRow(table, row));
    }

    public async all<R extends CodaTable>(table: new () => R): Promise<R[]> {
        const tableId = enforce(getTableId(table), `@TableId not set for class ${table.name}`);
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows`;
        const response = await this.api.get<CodaRowsResponse, CodaGetRowsQuery>(url);
        return response.items.map((row) => this.parseDtoRow(table, row));
    }

    public async insert<R extends CodaTable>(rows: R | R[]): Promise<CodaInsertResponse> {
        if (!Array.isArray(rows)) {
            rows = [rows];
        }
        enforce(
            rows.every((r) => !r.id),
            'All rows must not have an id to insert'
        );
        enforce(rows.length, 'No rows to insert');
        const tableId = enforce(
            getTableId(rows[0].constructor as new () => R),
            `@TableId not set for class ${rows[0].constructor.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows`;
        const response = await this.api.post<CodaInsertResponse, CodaPostRowsRequest>(url, {
            rows: rows.map((r) => this.parseCodaRow(r)),
        });
        for (const [index, row] of rows.entries()) {
            const newRow = new (row.constructor as new (
                ...args: ConstructorParameters<typeof CodaTable>
            ) => R)(this, { existsOnCoda: true });
            Object.assign(newRow, row.getValues());
            newRow.id = response.addedRowIds[index];
            newRow._resetDirty();
            Object.assign(row, newRow);
        }
        return response;
    }
    public async insertAndWait<R extends CodaTable>(rows: R | R[]): Promise<CodaInsertResponse> {
        return this.waitForMutation(this.insert(rows));
    }

    // todo: until we have a reliable way of getting inserted row ids, this method shound't be used
    // https://coda.io/developers/apis/v1#tag/Rows/operation/upsertRows
    // addedRowIds is returned only when keyColumns is NOT SET or EMPTY
    public async upsert<R extends CodaTable>(
        rows: R | R[],
        upsertBy: Exclude<
            {
                [K in keyof R]: R[K] extends Function ? never : K;
            }[keyof R],
            `_${string}`
        >[]
    ): Promise<CodaUpsertResponse> {
        if (!Array.isArray(rows)) {
            rows = [rows];
        }
        enforce(rows.length, 'No rows to upsert');
        const tableId = enforce(
            getTableId(rows[0].constructor as new () => R),
            `@TableId not set for class ${rows[0].constructor.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows`;
        const keyColumns = upsertBy.map((column) =>
            enforce(
                getColumnId(rows[0].constructor as new () => R, String(column)),
                `@ColumnId not set for property ${String(column)} in class ${rows[0].constructor.name}`
            )
        );
        return this.api.post<CodaUpsertResponse, CodaPostRowsRequest>(url, {
            rows: rows.map((r) => this.parseCodaRow(r, upsertBy)),
            keyColumns,
        });
    }

    public async update<R extends CodaTable>(row: R): Promise<CodaUpdateResponse> {
        const rowId = enforce(row.id, 'Cannot update row without an id');
        const tableId = enforce(
            getTableId(row.constructor as new () => R),
            `@TableId not set for class ${row.constructor.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows/${rowId}`;
        const response = await this.api.put<CodaUpdateResponse, CodaPutRowRequest>(url, {
            row: this.parseCodaRow(row),
        });
        row._resetDirty();
        return response;
    }

    public async updateAndWait<R extends CodaTable>(row: R) {
        return this.waitForMutation(this.update(row));
    }

    public async updateBatch<R extends CodaTable>(
        rows: R | R[],
        updateBy: Exclude<
            {
                [K in keyof R]: R[K] extends Function ? never : K;
            }[keyof R],
            `_${string}`
        >[]
    ): Promise<CodaUpsertResponse> {
        if (!Array.isArray(rows)) {
            rows = [rows];
        }
        enforce(rows.length, 'No rows to updateBatch');
        enforce(
            rows.every((r) => r.id),
            'All rows must have an id to updateBatch'
        );
        const response = await this.upsert(rows, updateBy);
        for (const row of rows) {
            row._resetDirty();
        }
        return response;
    }
    public async updateBatchAndWait<R extends CodaTable>(
        rows: R | R[],
        updateBy: Exclude<
            {
                [K in keyof R]: R[K] extends Function ? never : K;
            }[keyof R],
            `_${string}`
        >[]
    ): Promise<CodaUpsertResponse> {
        return this.waitForMutation(this.updateBatch(rows, updateBy));
    }

    public async delete<R extends CodaTable>(rows: R | R[]): Promise<CodaDeleteResponse> {
        if (!Array.isArray(rows)) {
            rows = [rows];
        }
        enforce(rows.length, 'No rows to delete');
        enforce(
            rows.every((r) => r.id),
            'All rows must have an id to delete'
        );
        const tableId = enforce(
            getTableId(rows[0].constructor as new () => R),
            `@TableId not set for class ${rows[0].constructor.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows`;
        return this.api.delete<CodaDeleteResponse, CodaDeleteRowsRequest>(url, {
            rowIds: rows.map((r) => r.id),
        });
    }
    public async deleteAndWait<R extends CodaTable>(rows: R | R[]): Promise<CodaDeleteResponse> {
        return this.waitForMutation(this.delete(rows));
    }
}
