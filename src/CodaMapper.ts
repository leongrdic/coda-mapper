import { CodaTable } from './CodaTable';
import {
    CodaError,
    delay,
    enforce,
    getColumnId,
    getMultiple,
    getRelation,
    getTableId,
    parseJson,
    parseURL,
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

/**
 * Class representing an api client for Coda
 *
 * Instantiate it with your docId and apiKey and use the instance to interact with your Coda doc.
 *
 * @example
 * const mapper = new CodaMapper('docId', 'apiKey');
 * const myTable = mapper.find(MyTable, 'name', 'John');
 * // etc...
 */
export class CodaMapper {
    private readonly baseUrl: string = 'https://coda.io/apis/v1';
    private readonly debugHttpRequests: boolean = false;

    constructor(
        private readonly docId: string,
        private readonly apiKey: string,
        options?: {
            baseUrl?: string;
            debugHttpRequests?: boolean;
        }
    ) {
        enforce(docId, 'docId is required');
        enforce(apiKey, 'apiKey is required');
        if (options?.baseUrl) this.baseUrl = options.baseUrl;
        if (options?.debugHttpRequests) {
            console.debug(
                '[CodaMapper] Debugging HTTP requests is enabled. This will log all requests and responses to the console. To disable it, set "debugHttpRequests" to false.'
            );
            this.debugHttpRequests = options.debugHttpRequests;
        }
    }

    private cache: Map<`${string}:${string}`, CodaTable> = new Map();
    /**
     * Internal function. Returns the cache used by the mapper. This is where all the magic happens.
     */
    public _getCache() {
        return this.cache;
    }
    /**
     * Internal function. Clears the cache. All the fetched rows will end up in limbo.
     * If you dereference them, they will be gone. If you don't and you fetch them again, you might end up with duplicates.
     *
     * Since I know you don't know what you're doing, you probably shouldn't use this. But hey, I'm not your boss.
     */
    public _clearCache() {
        this.cache.clear();
    }

    private async fetch<R>(url: string, options: RequestInit = {}) {
        const headers = new Headers({
            ...options.headers,
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
        });
        if (this.debugHttpRequests) {
            console.debug({
                message: `[CodaMapper] ${options.method} Request to ${url}`,
                url,
                method: options.method,
                headers: Object.fromEntries(headers.entries()),
                body: options.body ? JSON.parse(String(options.body)) : undefined,
            });
        }
        const response = await fetch(url, { ...options, headers });
        if (this.debugHttpRequests) {
            let body;
            try {
                body = await response.clone().json();
            } catch {
                body = await response.clone().text();
            }
            console[response.ok ? 'debug' : 'error']({
                message: `[CodaMapper] Response from ${url}`,
                url: response.url,
                status: response.status,
                body,
            });
        }
        return parseJson<R>(response);
    }

    private readonly api = {
        get: <R, Q>(url: string, params?: Q, options?: RequestInit) =>
            this.fetch<R>(
                parseURL(url, {
                    ...params,
                    useColumnNames: false,
                    valueFormat: 'rich',
                }),
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
        const parsedValues = {} as R;
        const row = new table();
        for (const prop of Object.keys(row.getValues())) {
            if (prop === 'id') continue;
            const columnId = enforce(
                getColumnId(table, prop),
                `@ColumnId not set for property "${prop}" in class ${table.name}`
            );
            const relation = getRelation(table, prop);
            const multiple = getMultiple(table, prop);
            const parsedValue = dtoRow.values[columnId] === undefined
                ? undefined
                : this.decodeRichValue(
                      dtoRow.values[columnId],
                      relation,
                      multiple,
                      table.name,
                      prop
                  );
            parsedValues[prop as keyof R] = parsedValue as R[keyof R];
        }
        parsedValues.id = dtoRow.id;
        const cachedRow = this.cache.get(`${getTableId(table)}:${dtoRow.id}`);
        if (cachedRow) {
            cachedRow._assign(this, { existsOnCoda: true, isFetched: true }, parsedValues, dtoRow);
            return cachedRow as R;
        }
        row._assign(this, { existsOnCoda: true, isFetched: true }, parsedValues, dtoRow);
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
                ))();
                table._assign(this, { existsOnCoda: true }, { id: value.rowId });
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

    /**
     * Waits for a mutation to complete.
     *
     * You probably want to use one of the following methods instead:
     * - `insertAndWait`
     * - `updateAndWait`
     * - `updateBatchAndWait`
     * - `deleteAndWait`
     *
     * @example
     * await mapper.waitForMutation(mapper.insert(rows));
     */
    public async waitForMutation<
        R extends CodaInsertResponse | CodaUpsertResponse | CodaUpdateResponse | CodaDeleteResponse,
    >(codaRequest: R | Promise<R>, delayTime: number = 5000) {
        const response = await codaRequest;
        let completed = false;
        let failCounter = 0;
        while (!completed) {
            await delay(delayTime);
            try {
                completed = (await this.getMutationStatus(response.requestId)).completed; // can be fetch error 404
            } catch (e) {
                if (e instanceof CodaError && e.response.status === 404) {
                    failCounter++;
                    if (failCounter >= 5) {
                        throw new Error(
                            `Failed to get mutation status for requestId ${response.requestId} after 5 attempts.`
                        );
                    }
                    continue;
                }
                throw e;
            }
        }
        return response;
    }

    /**
     * Refreshes a row from Coda. Useful when you want to make sure you have the latest data.
     *
     * You can also use `row.pull()` instead of this method. It uses this method internally.
     *
     * Be careful when using the `latest` option. If the API's view of the doc is not up to date, the API will return an HTTP 400 response.
     *
     * @example
     * const row = await mapper.get(MyTable, 'row-id');
     * // some time later
     * await mapper.refresh(row);
     * console.log(row); // latest data
     */
    public async refresh<R extends CodaTable>(
        row: R,
        options?: {
            latest?: boolean;
            params?: CodaGetRowQuery;
        }
    ) {
        const id = enforce(
            row._getState().existsOnCoda && row.id,
            `Unable to refresh row "${row.id}". This row hasn't been inserted to or fetched from Coda.`
        );
        enforce(
            await this.get(row.constructor as new () => R, id, options),
            `Refreshing row "${row.id}" on table ${row.constructor.name} does not exist anymore.`
        );
        return row;
    }

    /**
     * Fetches a row from Coda. If the row doesn't exist, it returns `null`.
     *
     * Careful when using the `latest` option. If the API's view of the doc is not up to date, the API will return an HTTP 400 response.
     *
     * @example
     * const row = await mapper.get(MyTable, 'row-id');
     * console.log(row); // row or null
     */
    public async get<T extends CodaTable>(
        table: new () => T,
        id: string,
        options?: {
            latest?: boolean;
        }
    ): Promise<T | null> {
        const tableId = enforce(getTableId(table), `@TableId not set for class ${table.name}`);
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows/${id}`;
        try {
            const response = await this.api.get<CodaRowResponse, CodaGetRowQuery>(
                url,
                undefined,
                options?.latest ? { headers: { 'X-Coda-Doc-Version': 'latest' } } : undefined
            );
            return this.parseDtoRow(table, response);
        } catch (e) {
            if (e instanceof CodaError && e.response.status === 404) return null;
            throw e;
        }
    }

    /**
     * Fetches all rows from a table that match a search criteria.
     *
     * Be careful when using the `latest` option. If the API's view of the doc is not up to date, the API will return an HTTP 400 response.
     *
     * @example
     * const rows = await mapper.find(MyTable, 'name', 'John');
     * console.log(rows); // all rows that have a 'name' column with value 'John'
     */
    public async find<R extends CodaTable>(
        table: new () => R,
        property: Exclude<
            {
                [K in keyof R]: R[K] extends Function ? never : K;
            }[keyof R],
            `_${string}` | 'id'
        >,
        value: string,
        options?: {
            latest?: boolean;
            params?: Pick<CodaGetRowsQuery, 'sortBy' | 'syncToken' | 'visibleOnly'>;
        }
    ): Promise<R[]> {
        const tableId = enforce(getTableId(table), `@TableId not set for class ${table.name}`);
        const columnId = enforce(
            getColumnId(table, String(property)),
            `@ColumnId not set for property ${String(property)} in class ${table.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows`;
        let response;
        const items: R[] = [];
        do {
            response = await this.api.get<CodaRowsResponse, CodaGetRowsQuery>(
                url,
                {
                    ...options?.params,
                    query: `"${columnId}":${JSON.stringify(value)}`,
                    pageToken:
                        response && 'nextPageToken' in response
                            ? response.nextPageToken
                            : undefined,
                    limit: 500, // max limit
                },
                options?.latest ? { headers: { 'X-Coda-Doc-Version': 'latest' } } : undefined
            );
            items.push(...response.items.map((row) => this.parseDtoRow(table, row)));
        } while (response && 'nextPageToken' in response && response.nextPageToken);
        return items;
    }

    /**
     * Fetches a single row from a table that matches a search criteria.
     *
     * Be careful when using the `latest` option. If the API's view of the doc is not up to date, the API will return an HTTP 400 response.
     *
     * @example
     * const row = await mapper.first(MyTable, 'name', 'John');
     * console.log(row); // a row that has a 'name' column with the value 'John'
     */
    public async first<R extends CodaTable>(
        table: new () => R,
        property: Exclude<
            {
                [K in keyof R]: R[K] extends Function ? never : K;
            }[keyof R],
            `_${string}` | 'id'
        >,
        value: string,
        options?: {
            latest?: boolean;
            params?: Pick<CodaGetRowsQuery, 'sortBy' | 'syncToken' | 'visibleOnly'>;
        }
    ): Promise<R | null> {
        const tableId = enforce(getTableId(table), `@TableId not set for class ${table.name}`);
        const columnId = enforce(
            getColumnId(table, String(property)),
            `@ColumnId not set for property ${String(property)} in class ${table.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows`;
        const response = await this.api.get<CodaRowsResponse, CodaGetRowsQuery>(
            url,
            {
                ...options?.params,
                query: `"${columnId}":${JSON.stringify(value)}`,
                limit: 1,
            },
            options?.latest ? { headers: { 'X-Coda-Doc-Version': 'latest' } } : undefined
        );
        return response.items.map((row) => this.parseDtoRow(table, row))[0] ?? null;
    }

    /**
     * Fetches all rows from a table.
     *
     * Be careful when using the `latest` option. If the API's view of the doc is not up to date, the API will return an HTTP 400 response.
     *
     * @example
     * const rows = await mapper.all(MyTable);
     * console.log(rows); // all rows from the table MyTable
     */
    public async all<R extends CodaTable>(
        table: new () => R,
        options?: {
            latest?: boolean;
            params?: Pick<CodaGetRowsQuery, 'sortBy' | 'syncToken' | 'visibleOnly'>;
        }
    ): Promise<R[]> {
        const tableId = enforce(getTableId(table), `@TableId not set for class ${table.name}`);
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows`;
        let response;
        const items: R[] = [];
        do {
            response = await this.api.get<CodaRowsResponse, CodaGetRowsQuery>(
                url,
                {
                    ...options?.params,
                    pageToken:
                        response && 'nextPageToken' in response
                            ? response.nextPageToken
                            : undefined,
                    limit: 500, // max limit
                },
                options?.latest ? { headers: { 'X-Coda-Doc-Version': 'latest' } } : undefined
            );
            items.push(...response.items.map((row) => this.parseDtoRow(table, row)));
        } while (response && 'nextPageToken' in response && response.nextPageToken);
        return items;
    }

    /**
     * Inserts a row or multiple rows to a table.
     *
     * @throws Will throw an error if any of the rows have an id.
     * @example
     * const row = new MyTable();
     * row.name = 'John';
     * await mapper.insert(row);
     * console.log(row.id); // the id of the inserted row
     */
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
            row._assign(this, { existsOnCoda: true }, {
                id: response.addedRowIds[index],
            } as typeof row);
            row._resetDirty();
        }
        return response;
    }
    /**
     * Inserts a row or multiple rows to a table and waits for the mutation to complete.
     * Internally, it uses `insert` and `waitForMutation`.
     *
     * @throws Will throw an error if any of the rows have an id.
     * @example
     * const row = new MyTable();
     * row.name = 'John';
     * await mapper.insertAndWait(row);
     * console.log(row.id); // the id of the inserted row
     */
    public async insertAndWait<R extends CodaTable>(rows: R | R[]): Promise<CodaInsertResponse> {
        return this.waitForMutation(this.insert(rows));
    }

    // todo: until we have a reliable way of getting inserted row ids, this method shound't be used
    // https://coda.io/developers/apis/v1#tag/Rows/operation/upsertRows
    // addedRowIds is returned only when keyColumns is NOT SET or EMPTY
    /**
     * Upserts a row or multiple rows to a table. Upserts by the specified columns.
     *
     * I don't encourage using this method until we have a reliable way of getting inserted row ids.
     * See https://coda.io/developers/apis/v1#tag/Rows/operation/upsertRows
     *
     * If you're stubborn and you're going to use this method anyway, I recommend refetching the rows after the upsert.
     *
     * @example
     * const row2 = new MyTable();
     * row2.name = 'John';
     * await mapper.upsert([row1, row2], ['name']);
     */
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

    /**
     * Updates a row in a table.
     *
     * If you want to update multiple rows, use `updateBatch` instead.
     *
     * You can also use `row.push()` instead of this method. It uses this method internally.
     *
     * @example
     * const row = await mapper.get(MyTable, 'row-id');
     * row.name = 'John';
     * await mapper.update(row);
     */
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
    /**
     * Updates a row in a table and waits for the mutation to complete.
     * Internally, it uses `update` and `waitForMutation`.
     *
     * If you want to update multiple rows, use `updateBatchAndWait` instead.
     *
     * You can also use `row.pushAndWait()` instead of this method. It uses this method internally.
     *
     * @example
     * const row = await mapper.get(MyTable, 'row-id');
     * row.name = 'John';
     * await mapper.updateAndWait(row);
     */
    public async updateAndWait<R extends CodaTable>(row: R) {
        return this.waitForMutation(this.update(row));
    }

    /**
     * Updates multiple rows in a table. You can specify which columns to update by.
     *
     * If you want to update a single row, use `update` instead.
     *
     * Unless other `updateBy` columns are specified, the `id` column will be used to update the rows. Make sure you have the `@ColumnId` set for the `id` column.
     *
     * @throws Will throw an error if any of the rows don't have an id.
     * @example
     * const rows = await mapper.find(MyTable, 'name', 'John');
     * rows.forEach(row => row.name = 'Jane');
     * await mapper.updateBatch(rows, ['name']);
     */
    public async updateBatch<R extends CodaTable>(
        rows: R | R[],
        updateBy: Exclude<
            {
                [K in keyof R]: R[K] extends Function ? never : K;
            }[keyof R],
            `_${string}`
        >[] = [
            'id' as Exclude<
                {
                    [K in keyof R]: R[K] extends Function ? never : K;
                }[keyof R],
                `_${string}`
            >,
        ]
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
    /**
     * Updates multiple rows in a table and waits for the mutation to complete.
     * Internally, it uses `updateBatch` and `waitForMutation`.
     *
     * If you want to update a single row, use `updateAndWait` instead.
     *
     * Unless other `updateBy` columns are specified, the `id` column will be used to update the rows. Make sure you have the `@ColumnId` set for the `id` column.
     *
     * @throws Will throw an error if any of the rows don't have an id.
     * @example
     * const rows = await mapper.find(MyTable, 'name', 'John');
     * rows.forEach(row => row.name = 'Jane');
     * await mapper.updateBatchAndWait(rows, ['name']);
     */
    public async updateBatchAndWait<R extends CodaTable>(
        rows: R | R[],
        updateBy: Exclude<
            {
                [K in keyof R]: R[K] extends Function ? never : K;
            }[keyof R],
            `_${string}`
        >[] = [
            'id' as Exclude<
                {
                    [K in keyof R]: R[K] extends Function ? never : K;
                }[keyof R],
                `_${string}`
            >,
        ]
    ): Promise<CodaUpsertResponse> {
        return this.waitForMutation(this.updateBatch(rows, updateBy));
    }

    /**
     * Deletes a row or multiple rows from a table.
     *
     * You can also use `row.delete()` instead of this method. It uses this method internally.
     *
     * @example
     * const row = await mapper.get(MyTable, 'row-id');
     * await mapper.delete(row);
     */
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
    /**
     * Deletes a row or multiple rows from a table and waits for the mutation to complete.
     * Internally, it uses `delete` and `waitForMutation`.
     *
     * You can also use `row.deleteAndWait()` instead of this method. It uses this method internally.
     *
     * @example
     * const row = await mapper.get(MyTable, 'row-id');
     * await mapper.deleteAndWait(row);
     */
    public async deleteAndWait<R extends CodaTable>(rows: R | R[]): Promise<CodaDeleteResponse> {
        return this.waitForMutation(this.delete(rows));
    }
}
