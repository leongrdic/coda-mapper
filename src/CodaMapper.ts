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
import { enforce, getMeta, parseJson } from './utils';

export class CodaMapper {
    private readonly baseUrl = 'https://coda.io/apis/v1';
    constructor(
        private readonly docId: string,
        private readonly apiKey: string
    ) {
        if (!docId) {
            throw new Error('docId is required');
        }
        if (!apiKey) {
            throw new Error('apiKey is required');
        }
    }

    private readonly fetch = <R>(url: string, options: RequestInit = {}) => {
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${this.apiKey}`);
        return parseJson<R>(fetch(url, { ...options, headers }));
    };

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

    private readonly parseCodaTable = <T extends CodaTable>(
        tableClass: new () => T,
        row: CodaRow
    ) => {
        const table = new tableClass();
        for (const [key, value] of Object.entries(
            this.parseValues(row.values)
        )) {
            (table as CodaTable)[key] = value;
        }
        return table;
    };
    private readonly parseValues = (values: CodaRow['values']) => {
        const parsedValues = {} as Record<
            string,
            RecursiveHelper<string | number | boolean>
        >;
        for (const [key, value] of Object.entries(values)) {
            parsedValues[key] = this.decodeRichValue(value);
        }
        return parsedValues;
    };
    private readonly decodeRichValue = (
        value: CodaRowValue
    ): RecursiveHelper<string | number> => {
        if (typeof value === 'string') {
            if (value.startsWith('```') && value.endsWith('```')) {
                value = value.substring(3, value.length - 3);
            }
            return value.replace(/\\`/g, '`');
        } else if (Array.isArray(value))
            return value.map((v) => this.decodeRichValue(v));
        else if (typeof value === 'object') {
            if (value['@type'] === 'MonetaryAmount') return value.amount;
            else if (value['@type'] === 'StructuredValue') return value.rowId;
            else if (
                value['@type'] === 'WebPage' ||
                value['@type'] === 'ImageObject'
            )
                return value.url;
            else if (value['@type'] === 'Person') return value.email;
        }
        return value;
    };

    public readonly get = async <T extends CodaTable>(
        tableClass: new () => T,
        id: string
    ): Promise<T | null> => {
        const tableId = enforce(
            getMeta(tableClass, 'tableId'),
            `TableId not set for class ${tableClass.name}`
        );
        enforce(
            getMeta(tableClass, 'id'),
            `ColumnId not set for property id in class ${tableClass.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows/${id}`;
        const response = await this.api.get<CodaRowResponse, CodaGetRowQuery>(
            url
        );
        return this.parseCodaTable(tableClass, response);
    };

    public readonly find = async <T extends CodaTable>(
        tableClass: new () => T,
        property: keyof T extends string ? keyof T : never,
        value: string
    ): Promise<T[]> => {
        const tableId = enforce(
            getMeta(tableClass, 'tableId'),
            `TableId not set for class ${tableClass.name}`
        );
        const columnId = enforce(
            getMeta(tableClass, property as string),
            `ColumnId not set for property ${property} in class ${tableClass.name}`
        );
        const url = `${this.baseUrl}/docs/${this.docId}/tables/${tableId}/rows`;
        const response = await this.api.get<CodaRowsResponse, CodaGetRowsQuery>(
            url,
            {
                query: `"${columnId}":${JSON.stringify(value)}`,
            }
        );
        return response.items.map((row) =>
            this.parseCodaTable(tableClass, row)
        );
    };
}
