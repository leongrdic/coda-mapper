import { CodaTable, ColumnId, References, TableId } from '../src';
import { getColumnId, getTableId } from '../src/utils';

import type { CodaRelation } from '../src';

class RelatedTable extends CodaTable {
    id: string;
    string: string;
}

@TableId('test_table_id')
class TestTable extends CodaTable {
    id: string; // id doesn't use @ColumnId
    @ColumnId('string_column_id') string: string;
    @ColumnId('number_column_id') number: number;
    @ColumnId('boolean_column_id') boolean: boolean;
    @ColumnId('related_table_column_id')
    @References(() => RelatedTable)
    relatedTable: CodaRelation<RelatedTable>;
    @ColumnId('related_table_array_column_id')
    @References(() => RelatedTable)
    relatedTableArray: CodaRelation<RelatedTable[]>;
}

let table: TestTable;
let relatedTable: RelatedTable;

describe('CodaTable module', () => {
    beforeEach(() => {
        relatedTable = new RelatedTable();
        relatedTable.string = 'related';

        table = new TestTable();
        table.string = 'test';
        table.number = 1;
        table.boolean = true;
        table.relatedTable = relatedTable;
        table.relatedTableArray = [relatedTable];
    });

    it('should not be instantiable', () => {
        /* @ts-expect-error CodaTable is abstract */
        expect(() => new CodaTable()).toThrow();
    });

    it('should be instantiable when extended', () => {
        expect(new TestTable()).toBeInstanceOf(TestTable);
    });

    it('should have correct metadata set', () => {
        expect(getTableId(table)).toBe('test_table_id');
        expect(getTableId(TestTable)).toBe('test_table_id');

        expect(getColumnId(table, 'string')).toBe('string_column_id');
        expect(getColumnId(TestTable, 'string')).toBe('string_column_id');

        expect(getColumnId(table, 'number')).toBe('number_column_id');
        expect(getColumnId(TestTable, 'number')).toBe('number_column_id');

        expect(getColumnId(table, 'boolean')).toBe('boolean_column_id');
        expect(getColumnId(TestTable, 'boolean')).toBe('boolean_column_id');

        expect(getColumnId(table, 'relatedTable')).toBe('related_table_column_id');
        expect(getColumnId(TestTable, 'relatedTable')).toBe('related_table_column_id');

        expect(getColumnId(table, 'relatedTableArray')).toBe('related_table_array_column_id');
        expect(getColumnId(TestTable, 'relatedTableArray')).toBe('related_table_array_column_id');
    });

    it('should have correct values set', () => {
        expect(table.getValues()).toStrictEqual({
            id: undefined,
            string: 'test',
            number: 1,
            boolean: true,
            relatedTable: relatedTable,
            relatedTableArray: [relatedTable],
        });

        expect(table.id).toBe(undefined);
        expect(table.string).toBe('test');
        expect(table.number).toBe(1);
        expect(table.boolean).toBe(true);
        expect(table.relatedTable).toBe(relatedTable);
        expect(table.relatedTableArray).toStrictEqual([relatedTable]);
    });

    it('should allow unassigning values when type is not enforced', () => {
        class UnassignableTable extends CodaTable {
            id: string;
            string: string | undefined;
            number: number | undefined;
            boolean: boolean | undefined;
            relatedTable: RelatedTable | undefined;
            relatedTableArray: RelatedTable[]; // for obvious reasons, this one shouldn't be able to be undefined
        }
        const unassignableTable = new UnassignableTable();
        unassignableTable.string = 'test';
        unassignableTable.number = 1;
        unassignableTable.boolean = true;
        unassignableTable.relatedTable = relatedTable;
        unassignableTable.relatedTableArray = [relatedTable];
        expect(unassignableTable.getValues()).toStrictEqual({
            id: undefined,
            string: 'test',
            number: 1,
            boolean: true,
            relatedTable: relatedTable,
            relatedTableArray: [relatedTable],
        });

        unassignableTable.string = undefined;
        unassignableTable.number = undefined;
        unassignableTable.boolean = undefined;
        unassignableTable.relatedTable = undefined;
        unassignableTable.relatedTableArray = [];
        expect(unassignableTable.getValues()).toStrictEqual({
            id: undefined,
            string: undefined,
            number: undefined,
            boolean: undefined,
            relatedTable: undefined,
            relatedTableArray: [],
        });
    });

    it('should correctly evaluate dirty parameter', () => {
        // Initial state should be dirty since the table is not sent to the server
        expect(table.isDirty()).toBe(true);
        expect(table.getDirtyValues()).toStrictEqual({
            id: undefined,
            string: 'test',
            number: 1,
            boolean: true,
            relatedTable: relatedTable,
            relatedTableArray: [relatedTable],
        });

        // Resetting the dirty state should return false
        table._resetDirty();
        expect(table.isDirty()).toBe(false);
        expect(table.getValues()).toStrictEqual({
            id: undefined,
            string: 'test',
            number: 1,
            boolean: true,
            relatedTable: relatedTable,
            relatedTableArray: [relatedTable],
        });
        expect(table.getDirtyValues()).toStrictEqual({});

        // Setting a value to the same value should not make the table dirty
        table.string = 'test';
        expect(table.isDirty()).toBe(false);
        expect(table.getValues()).toStrictEqual({
            id: undefined,
            string: 'test',
            number: 1,
            boolean: true,
            relatedTable: relatedTable,
            relatedTableArray: [relatedTable],
        });
        expect(table.getDirtyValues()).toStrictEqual({});

        // Changing a value should make the table dirty
        table.number = 3;
        expect(table.isDirty()).toBe(true);
        expect(table.getValues()).toStrictEqual({
            id: undefined,
            string: 'test',
            number: 3,
            boolean: true,
            relatedTable: relatedTable,
            relatedTableArray: [relatedTable],
        });
        expect(table.getDirtyValues()).toStrictEqual({
            number: 3,
        });

        // Changing a value back to the original should not make the table dirty
        table.number = 1;
        expect(table.isDirty()).toBe(false);
        expect(table.getValues()).toStrictEqual({
            id: undefined,
            string: 'test',
            number: 1,
            boolean: true,
            relatedTable: relatedTable,
            relatedTableArray: [relatedTable],
        });
        expect(table.getDirtyValues()).toStrictEqual({});
    });

    it('should correctly evaluate dirty parameter for all cases', () => {
        const otherRelatedTable = new RelatedTable();
        const tableProperties = [
            ['string', 'test', 'test2'],
            ['number', 1, 2],
            ['boolean', true, false],
            ['relatedTable', relatedTable, otherRelatedTable],
            ['relatedTableArray', [relatedTable], [relatedTable, otherRelatedTable]],
        ] as const;
        for (const [accessor, originalValue, newValue] of tableProperties) {
            const tableValues = table.getValues();
            table._resetDirty();
            (table[accessor] as any) = newValue;
            expect(table.isDirty()).toBe(true);
            expect(table[accessor]).toStrictEqual(newValue);
            expect(table.getDirtyValues()).toStrictEqual({
                [accessor]: newValue,
            });
            expect(table.getValues()).toStrictEqual({
                ...tableValues,
                [accessor]: newValue,
            });
            (table[accessor] as any) = originalValue;
            expect(table.isDirty()).toBe(false);
            expect(table[accessor]).toStrictEqual(originalValue);
            expect(table.getDirtyValues()).toStrictEqual({});
            expect(table.getValues()).toStrictEqual(tableValues);
        }
    });

    it('should be passed by reference', async () => {
        const table2 = table;
        table2.string = 'test2';
        expect(table.string).toBe('test2');

        function changeTable(table: TestTable) {
            table.string = 'test3';
        }
        changeTable(table2);
        expect(table.string).toBe('test3');

        const propertyTable = await table.relatedTable;
        propertyTable.string = 'related2';
        expect(propertyTable.string).toBe('related2');
        expect(relatedTable.string).toBe('related2');
        const replaceTable = <T extends CodaTable>(row: T) => {
            const newRow = new TestTable();
            newRow.number = 5;
            Object.assign(row, newRow);
            return row;
        };
        replaceTable(table);
        expect(table.number).toBe(5);
        expect(table.getValues()).toStrictEqual({
            id: undefined,
            string: undefined,
            number: 5,
            boolean: undefined,
            relatedTable: undefined,
            relatedTableArray: undefined,
        });
        table.number = 1;
        table = replaceTable(table);
        expect(table.number).toBe(5);
        expect(table.getValues()).toStrictEqual({
            id: undefined,
            string: undefined,
            number: 5,
            boolean: undefined,
            relatedTable: undefined,
            relatedTableArray: undefined,
        });
    });

    it('should throw if you pass wrong relations', () => {
        class OtherRelatedTable extends CodaTable {
            id: string;
            number: number;
        }
        const otherRelatedTable = new OtherRelatedTable();
        expect(() => {
            /* @ts-expect-error this is the wrong table being inserted */
            table.relatedTable = otherRelatedTable;
        }).toThrow('Expected RelatedTable but got OtherRelatedTable');
    });

    it('should throw appropriate refresh errors', () => {
        expect(() => table.refresh()).rejects.toThrow(
            'Unable to refresh row "undefined". This row hasn\'t been inserted to or fetched from Coda.'
        );
        table.id = 'some_id';
        expect(() => table.refresh()).rejects.toThrow(
            'Unable to refresh row "some_id". This row hasn\'t been inserted to or fetched from Coda.'
        );
    });
});
