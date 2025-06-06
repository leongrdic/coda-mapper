import { CodaMapper, CodaTable, ColumnId, Multiple, References, TableId } from '../src';
import { delay, parseURL } from '../src/utils';

import type {
    CodaDeleteRowsRequest,
    CodaInsertResponse,
    CodaPostRowsRequest,
    CodaPutRowRequest,
    CodaRelation,
    CodaRowResponse,
    CodaRowsResponse,
} from '../src/types';

const mapper = new CodaMapper('doc_id', 'api_key');

const mockFetchResponse = <T>(...responses: Array<T>) => {
    let fn = jest.fn();
    for (const [index, response] of responses.entries()) {
        fn = fn[index === responses.length - 1 ? 'mockResolvedValue' : 'mockResolvedValueOnce']({
            ok: true,
            json: async () => {
                await delay(30);
                return response;
            },
        });
    }
    global.fetch = fn;
};

describe('CodaMapper module', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        mapper._clearCache();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should throw an error if no docId is provided', () => {
        /* @ts-expect-error docId is required */
        expect(() => new CodaMapper()).toThrow('docId is required');
    });
    it('should throw an error if no apiKey is provided', () => {
        /* @ts-expect-error apiKey is required */
        expect(() => new CodaMapper('doc_id')).toThrow('apiKey is required');
    });

    it('should throw an error if no tableId is provided', () => {
        class TestTable extends CodaTable {
            id: string;
        }
        expect(mapper.get(TestTable, 'some_column_id')).rejects.toThrow(
            '@TableId not set for class TestTable'
        );
    });
    it('should correctly fetch and parse a CodaTable, as well as cache the reference.', async () => {
        @TableId('table_id')
        class TestTable extends CodaTable {
            id: string;
            @ColumnId('column_name') name: string;
        }
        mockFetchResponse({
            id: 'id_value',
            createdAt: 'then',
            updatedAt: 'now',
            browserLink: 'some_link',
            values: {
                column_name: 'name_value',
            },
        } satisfies Partial<CodaRowResponse>);
        const table = await mapper.get(TestTable, 'id_value');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        if (!table) {
            throw new Error('Table is undefined');
        }
        expect(table).toBeInstanceOf(TestTable);
        expect(table.getValues()).toStrictEqual({
            id: 'id_value',
            name: 'name_value',
        });
        expect(table.getMeta()).toStrictEqual({
            browserLink: 'some_link',
            createdAt: 'then',
            updatedAt: 'now',
        });

        const table2 = await mapper.get(TestTable, 'id_value');
        if (!table2) {
            throw new Error('Table is undefined');
        }
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(table2).toBe(table);
        table.name = 'new_name';
        expect(table.name).toBe('new_name');
        expect(table2.name).toBe('new_name');
    });
    it('should correctly parse all string responses', async () => {
        @TableId('table_id')
        class TestTable extends CodaTable {
            id: string;
            @ColumnId('empty_string') emptyString: string;
            @ColumnId('empty_string_array') @Multiple emptyArray: string[];
            @ColumnId('empty_relation')
            @References(() => TestTable)
            emptyRelation: CodaRelation<TestTable>;
            @ColumnId('empty_relation_array')
            @References(() => TestTable)
            @Multiple
            emptyRelationArray: CodaRelation<TestTable[]>;
        }
        mockFetchResponse({
            id: 'id_value',
            values: {
                empty_string: '',
                empty_string_array: '',
                empty_relation: '',
                empty_relation_array: '',
            },
        } satisfies Partial<CodaRowResponse>);
        const table = await mapper.get(TestTable, 'id_value');
        if (!table) {
            throw new Error('Table is undefined');
        }
        expect(table.emptyString).toStrictEqual('');
        expect(table.emptyArray).toStrictEqual([]);
        expect(table.emptyRelation).toStrictEqual(undefined);
        expect(table.emptyRelationArray).toStrictEqual([]);
        expect(table.getValues()).toStrictEqual({
            id: 'id_value',
            emptyString: '',
            emptyArray: [],
            emptyRelation: undefined,
            emptyRelationArray: [],
        });
    });
    it('should fetch the row with the correct options', async () => {
        @TableId('table_id')
        class TestTable extends CodaTable {
            id: string;
            @ColumnId('column_name') name: string;
        }
        mockFetchResponse(
            {
                id: 'id_value',
                values: {
                    column_name: 'name_value',
                },
            } satisfies Partial<CodaRowResponse>,
            {
                items: [
                    {
                        id: 'id_value',
                        values: {
                            column_name: 'name_value',
                        },
                        browserLink: 'browser_link',
                        createdAt: 'created_at',
                        href: 'href',
                        index: 0,
                        name: 'name',
                        type: 'row',
                        updatedAt: 'updated_at',
                    },
                ],
            } satisfies Partial<CodaRowsResponse>
        );
        await mapper.get(TestTable, 'id_value', {
            latest: true,
        });
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            parseURL('https://coda.io/apis/v1/docs/doc_id/tables/table_id/rows/id_value', {
                useColumnNames: false,
                valueFormat: 'rich',
            }),
            {
                method: 'GET',
                headers: new Headers({
                    Authorization: 'Bearer api_key',
                    Accept: 'application/json',
                    'X-Coda-Doc-Version': 'latest',
                }),
            }
        );
        const paramsFind = {
            sortBy: 'createdAt',
            syncToken: '123',
            visibleOnly: true,
        } as const;
        await mapper.find(TestTable, 'name', 'name_value', {
            params: paramsFind,
            latest: true,
        });
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            parseURL('https://coda.io/apis/v1/docs/doc_id/tables/table_id/rows', {
                ...paramsFind,
                query: `"column_name":${JSON.stringify('name_value')}`,
                limit: 500,
                useColumnNames: false,
                valueFormat: 'rich',
            }),
            {
                method: 'GET',
                headers: new Headers({
                    Authorization: 'Bearer api_key',
                    Accept: 'application/json',
                    'X-Coda-Doc-Version': 'latest',
                }),
            }
        );
        const paramsFirst = {
            sortBy: 'createdAt',
            syncToken: '123',
            visibleOnly: true,
        } as const;
        await mapper.first(TestTable, 'name', 'name_value', {
            params: paramsFirst,
            latest: true,
        });
        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(global.fetch).toHaveBeenNthCalledWith(
            3,
            parseURL('https://coda.io/apis/v1/docs/doc_id/tables/table_id/rows', {
                ...paramsFind,
                query: `"column_name":${JSON.stringify('name_value')}`,
                limit: 1,
                useColumnNames: false,
                valueFormat: 'rich',
            }),
            {
                method: 'GET',
                headers: new Headers({
                    Authorization: 'Bearer api_key',
                    Accept: 'application/json',
                    'X-Coda-Doc-Version': 'latest',
                }),
            }
        );
        const paramsAll = {
            sortBy: 'createdAt',
            syncToken: '123',
            visibleOnly: true,
        } as const;
        await mapper.all(TestTable, {
            params: paramsAll,
            latest: true,
        });
        expect(global.fetch).toHaveBeenCalledTimes(4);
        expect(global.fetch).toHaveBeenNthCalledWith(
            4,
            parseURL('https://coda.io/apis/v1/docs/doc_id/tables/table_id/rows', {
                ...paramsAll,
                limit: 500,
                useColumnNames: false,
                valueFormat: 'rich',
            }),
            {
                method: 'GET',
                headers: new Headers({
                    Authorization: 'Bearer api_key',
                    Accept: 'application/json',
                    'X-Coda-Doc-Version': 'latest',
                }),
            }
        );
    });

    it('should refresh the row with the latest data from Coda', async () => {
        @TableId('table_id')
        class TestTable extends CodaTable {
            @ColumnId('column_id') id: string;
            @ColumnId('column_name') name: string;
        }
        mockFetchResponse({
            id: 'id_value',
            values: {
                column_name: 'name_value',
            },
        } satisfies Partial<CodaRowResponse>);
        const table = await mapper.get(TestTable, 'id_value');
        if (!table) {
            throw new Error('Table is undefined');
        }
        expect(table.name).toBe('name_value');
        mockFetchResponse({
            id: 'id_value',
            values: {
                column_name: 'new_name_value',
            },
        } satisfies Partial<CodaRowResponse>);
        await mapper.refresh(table);
        expect(table.name).toBe('new_name_value');
        mockFetchResponse({
            id: 'id_value',
            values: {
                column_name: 'new_new_name_value',
            },
        } satisfies Partial<CodaRowResponse>);
        const table2 = await table.pull();
        expect(table.name).toBe('new_new_name_value');
        expect(table2).toBe(table);

        // this must work even if the table is not fetched from api
        const table3 = new TestTable();
        table3.name = 'name_value';
        mockFetchResponse({
            addedRowIds: ['id_value'],
        } satisfies Partial<CodaInsertResponse>);
        await mapper.insert(table3);
        expect(table3.getValues()).toStrictEqual({
            id: 'id_value',
            name: 'name_value',
        });
        expect(table3._getState()).toStrictEqual({
            existsOnCoda: true,
            isFetched: false,
        });
        expect(mapper._getCache().get('table_id:id_value')).toBe(table3);
    });

    it('should fetch relation when relation is awaited', async () => {
        @TableId('table1_id')
        class Table1 extends CodaTable {
            id: string;
            @ColumnId('table1_number') number: number;
            @ColumnId('table1_relation') @References(() => Table2) table2: CodaRelation<Table2>;
        }
        @TableId('table2_id')
        class Table2 extends CodaTable {
            id: string;
            @ColumnId('table2_text') text: string;
            @ColumnId('table2_relation') @References(() => Table1) table1: CodaRelation<Table1>;
        }

        mockFetchResponse({
            id: 'table1_id_value',
            values: {
                table1_number: 12,
                table1_relation: {
                    '@context': 'http://schema.org',
                    '@type': 'StructuredValue',
                    additionalType: 'row',
                    name: 'name',
                    rowId: 'table2_id_value',
                    tableId: 'table2_id',
                    tableUrl: 'url',
                    url: 'url',
                },
            },
        } satisfies Partial<CodaRowResponse>);
        const table1 = await mapper.get(Table1, 'table1_id_value');
        if (!table1) {
            throw new Error('Table1 is undefined');
        }

        // when values are fetched, the relation should be an unfetched Table2 instance
        expect(table1.getValues().table2).toBeInstanceOf(Table2);
        expect((table1.getValues().table2 as Table2)._getState().existsOnCoda).toBe(true);
        expect((table1.getValues().table2 as Table2)._getState().isFetched).toBe(false);

        mockFetchResponse({
            id: 'table2_id_value',
            values: {
                table2_text: 'asd',
                table2_relation: {
                    '@context': 'http://schema.org',
                    '@type': 'StructuredValue',
                    additionalType: 'row',
                    name: 'name',
                    rowId: 'table1_id_value',
                    tableId: 'table1_id',
                    tableUrl: 'url',
                    url: 'url',
                },
            },
        } satisfies Partial<CodaRowResponse>);

        // when accessed directly, it should return a promise that resolves into a Table2 instance
        let table2 = table1.table2;
        expect(table2).toBeInstanceOf(Promise);
        expect(table2).resolves.toBeInstanceOf(Table2);

        // after awaiting, it should be a Table2 instance
        table2 = await table1.table2;
        expect(table2).toBeInstanceOf(Table2);

        // once fetched, direct access should be a Table2 instance and not a promise
        table2 = table1.table2;
        expect(table2).toBeInstanceOf(Table2);
    });

    it('should fetch relation when relation is awaited', async () => {
        @TableId('table1_id')
        class Table1 extends CodaTable {
            id: string;
            @ColumnId('table1_number') number: number;
            @ColumnId('table1_relations') @References(() => Table2) @Multiple table2s: CodaRelation<
                Table2[]
            >;
        }
        @TableId('table2_id')
        class Table2 extends CodaTable {
            id: string;
            @ColumnId('table2_text') text: string;
            @ColumnId('table2_relations') @References(() => Table1) @Multiple table1s: CodaRelation<
                Table1[]
            >;
        }

        mockFetchResponse({
            id: 'table1_id_value',
            values: {
                table1_number: 12,
                table1_relations: [
                    {
                        '@context': 'http://schema.org',
                        '@type': 'StructuredValue',
                        additionalType: 'row',
                        name: 'name',
                        rowId: 'table2_id_value',
                        tableId: 'table2_id',
                        tableUrl: 'url',
                        url: 'url',
                    },
                ],
            },
        } satisfies Partial<CodaRowResponse>);
        const table1 = await mapper.get(Table1, 'table1_id_value');
        if (!table1) {
            throw new Error('Table1 is undefined');
        }

        // when values are received, the relation should be an unfetched Table2 instance
        for (const t of table1.getValues().table2s) {
            expect(t).toBeInstanceOf(Table2);
        }

        mockFetchResponse({
            id: 'table2_id_value',
            values: {
                table2_text: 'asd',
                table2_relations: [
                    {
                        '@context': 'http://schema.org',
                        '@type': 'StructuredValue',
                        additionalType: 'row',
                        name: 'name',
                        rowId: 'table1_id_value3',
                        tableId: 'table1_id',
                        tableUrl: 'url',
                        url: 'url',
                    },
                    {
                        '@context': 'http://schema.org',
                        '@type': 'StructuredValue',
                        additionalType: 'row',
                        name: 'name',
                        rowId: 'table1_id_value4',
                        tableId: 'table1_id',
                        tableUrl: 'url',
                        url: 'url',
                    },
                ],
            },
        } satisfies Partial<CodaRowResponse>);

        // when accessing an array, make sure it's a promise that resolves into an array of Table2 instances
        const table2s = await table1.table2s;
        expect(table2s).toBeInstanceOf(Array);
        expect(table2s[0]).toBeInstanceOf(Table2);
    });

    it("should fetch other table's relation when relation is awaited", async () => {
        @TableId('table1_id')
        class Table1 extends CodaTable {
            id: string;
            @ColumnId('table1_number') number: number[];
        }
        @TableId('table2_id')
        class Table2 extends CodaTable {
            id: string;
            @ColumnId('table2_text') text: string;
            @ColumnId('table2_relation') @References(() => Table1) table1: CodaRelation<Table1>;
        }
        @TableId('table3_id')
        class Table3 extends CodaTable {
            id: string;
            @ColumnId('table3_boolean') boolean: boolean;
            @ColumnId('table3_relation') @References(() => Table1) table1: CodaRelation<Table1>;
        }

        mockFetchResponse({
            id: 'table2_id_value',
            values: {
                table2_text: '```hello```',
                table2_relation: {
                    '@context': 'http://schema.org',
                    '@type': 'StructuredValue',
                    additionalType: 'row',
                    name: 'name',
                    rowId: 'table1_id_value',
                    tableId: 'table1_id',
                    tableUrl: 'url',
                    url: 'url',
                },
            },
        } satisfies Partial<CodaRowResponse>);
        const table2 = await mapper.get(Table2, 'table2_id_value');
        if (!table2) {
            throw new Error('Table1 is undefined');
        }
        mockFetchResponse({
            id: 'table3_id_value',
            values: {
                table3_boolean: true,
                table3_relation: {
                    '@context': 'http://schema.org',
                    '@type': 'StructuredValue',
                    additionalType: 'row',
                    name: 'name',
                    rowId: 'table1_id_value',
                    tableId: 'table1_id',
                    tableUrl: 'url',
                    url: 'url',
                },
            },
        } satisfies Partial<CodaRowResponse>);
        const table3 = await mapper.get(Table3, 'table3_id_value');
        if (!table3) {
            throw new Error('Table1 is undefined');
        }

        mockFetchResponse({
            id: 'table1_id_value',
            values: {
                table1_number: [123, 456],
            },
        } satisfies Partial<CodaRowResponse>);

        let table1 = table2.table1;
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(table1).toBeInstanceOf(Promise);
        expect(table1).resolves.toBeInstanceOf(Table1);
        table1 = await table2.table1;
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(table1).toBeInstanceOf(Table1);
        // without awaiting, this should now be a resolved table1 instance
        const otherTable1 = table3.table1;
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(otherTable1).toBeInstanceOf(Table1);
        expect(otherTable1).toBe(table1);
    });

    it('should correctly insert a new row', async () => {
        @TableId('table_id')
        class TestTable extends CodaTable {
            id: string;
            @ColumnId('column_name') name: string;
        }

        const newTable = new TestTable();
        newTable.name = 'name_value';

        mockFetchResponse({
            addedRowIds: ['id_value'],
            requestId: 'request_id',
        } satisfies CodaInsertResponse);

        await mapper.insert(newTable);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            'https://coda.io/apis/v1/docs/doc_id/tables/table_id/rows',
            {
                method: 'POST',
                body: JSON.stringify({
                    rows: [
                        {
                            cells: [{ column: 'column_name', value: 'name_value' }],
                        },
                    ],
                } satisfies CodaPostRowsRequest),
                headers: new Headers({
                    Authorization: 'Bearer api_key',
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                }),
            }
        );

        expect(newTable.id).toBe('id_value');
        expect(newTable._getState()).toStrictEqual({
            existsOnCoda: true,
            isFetched: false,
        });
        expect(newTable.getValues()).toStrictEqual({
            id: 'id_value',
            name: 'name_value',
        });
        expect(newTable.getDirtyValues()).toStrictEqual({});
    });

    it('should correctly update a row', async () => {
        @TableId('table_id')
        class TestTable extends CodaTable {
            id: string;
            @ColumnId('column_name') name: string;
        }

        mockFetchResponse({
            id: 'id_value',
            values: {
                column_name: 'name_value',
            },
        } satisfies Partial<CodaRowResponse>);

        const table = await mapper.get(TestTable, 'id_value');
        if (!table) {
            throw new Error('Table is undefined');
        }

        table.name = 'new_name_value';

        expect(table.isDirty()).toBe(true);
        expect(table.getValues()).toStrictEqual({
            id: 'id_value',
            name: 'new_name_value',
        });
        expect(table.getDirtyValues()).toStrictEqual({
            name: 'new_name_value',
        });

        await table.push();

        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            'https://coda.io/apis/v1/docs/doc_id/tables/table_id/rows/id_value',
            {
                method: 'PUT',
                body: JSON.stringify({
                    row: {
                        cells: [{ column: 'column_name', value: 'new_name_value' }],
                    },
                } satisfies CodaPutRowRequest),
                headers: new Headers({
                    Authorization: 'Bearer api_key',
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                }),
            }
        );

        expect(table.isDirty()).toBe(false);
        expect(table.getValues()).toStrictEqual({
            id: 'id_value',
            name: 'new_name_value',
        });
        expect(table.getDirtyValues()).toStrictEqual({});
    });

    it('should correctly batchUpdate rows', async () => {
        @TableId('table_id')
        class TestTable extends CodaTable {
            @ColumnId('column_id') id: string;
            @ColumnId('column_name') name: string;
        }

        mockFetchResponse({
            items: [
                {
                    id: 'id_value',
                    values: {
                        column_name: 'name_value',
                    },
                    browserLink: 'browser_link',
                    createdAt: 'created_at',
                    href: 'href',
                    index: 0,
                    name: 'name',
                    type: 'row',
                    updatedAt: 'updated_at',
                },
                {
                    id: 'id_value2',
                    values: {
                        column_name: 'name_value2',
                    },
                    browserLink: 'browser_link',
                    createdAt: 'created_at',
                    href: 'href',
                    index: 0,
                    name: 'name',
                    type: 'row',
                    updatedAt: 'updated_at',
                },
            ],
        } satisfies Partial<CodaRowsResponse>);

        const tables = await mapper.all(TestTable);
        expect(tables).toHaveLength(2);
        for (const [index, table] of tables.entries()) {
            expect(table).toBeInstanceOf(TestTable);
            table.name = `new_name_value${index}`;
            expect(table.isDirty()).toBe(true);
        }

        await mapper.updateBatch(tables, ['id']);

        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            'https://coda.io/apis/v1/docs/doc_id/tables/table_id/rows',
            {
                method: 'POST',
                body: JSON.stringify({
                    rows: [
                        {
                            cells: [
                                {
                                    column: 'column_id',
                                    value: 'id_value',
                                },
                                {
                                    column: 'column_name',
                                    value: 'new_name_value0',
                                },
                            ],
                        },
                        {
                            cells: [
                                {
                                    column: 'column_id',
                                    value: 'id_value2',
                                },
                                {
                                    column: 'column_name',
                                    value: 'new_name_value1',
                                },
                            ],
                        },
                    ],
                    keyColumns: ['column_id'],
                } satisfies CodaPostRowsRequest),
                headers: new Headers({
                    Authorization: 'Bearer api_key',
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                }),
            }
        );

        for (const [index, table] of tables.entries()) {
            expect(table.isDirty()).toBe(false);
            expect(table.getValues()).toStrictEqual({
                id: table.id,
                name: `new_name_value${index}`,
            });
            expect(table.getDirtyValues()).toStrictEqual({});
        }
    });

    it('should correctly delete a row', async () => {
        @TableId('table_id')
        class TestTable extends CodaTable {
            id: string;
            @ColumnId('column_name') name: string;
        }

        mockFetchResponse({
            id: 'id_value',
            values: {
                column_name: 'name_value',
            },
        } satisfies Partial<CodaRowResponse>);

        const table = await mapper.get(TestTable, 'id_value');
        if (!table) {
            throw new Error('Table is undefined');
        }

        await table.delete();

        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            'https://coda.io/apis/v1/docs/doc_id/tables/table_id/rows',
            {
                method: 'DELETE',
                body: JSON.stringify({
                    rowIds: ['id_value'],
                } satisfies CodaDeleteRowsRequest),
                headers: new Headers({
                    Authorization: 'Bearer api_key',
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                }),
            }
        );
    });
});
