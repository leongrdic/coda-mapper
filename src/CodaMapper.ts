import { CodaTable } from './CodaTable';
import {
    CodaGetRowQuery,
    CodaGetRowsQuery,
    CodaRow,
    CodaRowResponse,
    CodaRowsResponse,
    CodaRowValue,
    RecursiveHelper,
} from './types';
import { enforce, getColumnId, getRelation, getTableId, parseJson } from './utils';

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
    };

    private parseCodaTable<T extends CodaTable>(
        tableClass: new (...args: ConstructorParameters<typeof CodaTable>) => T,
        row: CodaRow
    ) {
        const table = new tableClass(this, { existsOnCoda: true, isFetched: true });
        for (const tableKey of Object.keys(table.getValues())) {
            if (tableKey === 'id') continue;
            const columnId = enforce(
                getColumnId(tableClass, tableKey),
                `ColumnId not set for property "${tableKey}" in class ${tableClass.name}`
            );
            const relation = getRelation(tableClass, tableKey);
            const parsedValue = !row.values[columnId]
                ? undefined
                : this.decodeRichValue(row.values[columnId], relation, tableClass.name, tableKey);
            table[tableKey as keyof T] = parsedValue as T[keyof T];
        }
        table.id = row.id;
        table._resetDirty();
        const cachedRow = this.cache.get(`${getTableId(tableClass)}:${row.id}`);
        if (cachedRow) {
            Object.assign(cachedRow, table);
            return cachedRow as T;
        }
        this.cache.set(`${getTableId(tableClass)}:${row.id}`, table);
        return table;
    }
    private decodeRichValue(
        value: CodaRowValue,
        relation?: new (...args: ConstructorParameters<typeof CodaTable>) => CodaTable,
        className?: string,
        keyName?: string
    ): RecursiveHelper<string | number | boolean | CodaTable> {
        if (typeof value === 'string') {
            if (value.startsWith('```') && value.endsWith('```')) {
                value = value.substring(3, value.length - 3);
            }
            return value.replace(/\\`/g, '`');
        } else if (Array.isArray(value)) return value.map((v) => this.decodeRichValue(v));
        else if (typeof value === 'object') {
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

    public async refresh<R extends CodaTable>(row: R) {
        const id = enforce(
            row.id,
            `Unable to refresh row "${row.id}". This row hasn\'t been inserted to or fetched from Coda.`
        );
        const newRow = enforce(
            await this.get(row.constructor as new () => R, id),
            `Refreshing row "${row.id}" on table ${row.constructor.name} returned null`
        );
        Object.assign(row, newRow);
        return row;
    }

    public async get<T extends CodaTable>(tableClass: new () => T, id: string): Promise<T | null> {
        const tableId = enforce(
            getTableId(tableClass),
            `TableId not set for class ${tableClass.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows/${id}`;
        const response = await this.api.get<CodaRowResponse, CodaGetRowQuery>(url);
        return this.parseCodaTable(tableClass, response);
    }

    public async find<T extends CodaTable>(
        tableClass: new () => T,
        property: Exclude<
            {
                [K in keyof T]: T[K] extends Function ? never : K;
            }[keyof T],
            `_${string}` | 'id'
        >,
        value: string
    ): Promise<T[]> {
        const tableId = enforce(
            getTableId(tableClass),
            `TableId not set for class ${tableClass.name}`
        );
        const columnId = enforce(
            getColumnId(tableClass, String(property)),
            `ColumnId not set for property ${String(property)} in class ${tableClass.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows`;
        const response = await this.api.get<CodaRowsResponse, CodaGetRowsQuery>(url, {
            query: `"${columnId}":${JSON.stringify(value)}`,
        });
        return response.items.map((row) => this.parseCodaTable(tableClass, row));
    }
}
