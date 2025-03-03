import { CodaTable, ColumnId, TableId } from '../src';
import { getMeta } from '../src/utils';

@TableId('test_table_id')
class TestTable extends CodaTable {
    @ColumnId('id_column_id') readonly id: string;
    @ColumnId('string_column_id') string: string;
    @ColumnId('number_column_id') number: number;
    @ColumnId('boolean_column_id') boolean: boolean;
    @ColumnId('related_table_column_id') relatedTable: RelatedTable;
    @ColumnId('related_table_array_column_id')
    relatedTableArray: RelatedTable[];
}

class RelatedTable extends CodaTable {
    readonly id: string;
    string: string;
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
        expect(getMeta(table, 'tableId')).toBe('test_table_id');
        expect(getMeta(TestTable, 'tableId')).toBe('test_table_id');

        expect(getMeta(table, 'id')).toBe('id_column_id');
        expect(getMeta(TestTable, 'id')).toBe('id_column_id');

        expect(getMeta(table, 'string')).toBe('string_column_id');
        expect(getMeta(TestTable, 'string')).toBe('string_column_id');

        expect(getMeta(table, 'number')).toBe('number_column_id');
        expect(getMeta(TestTable, 'number')).toBe('number_column_id');

        expect(getMeta(table, 'boolean')).toBe('boolean_column_id');
        expect(getMeta(TestTable, 'boolean')).toBe('boolean_column_id');

        expect(getMeta(table, 'relatedTable')).toBe('related_table_column_id');
        expect(getMeta(TestTable, 'relatedTable')).toBe(
            'related_table_column_id'
        );

        expect(getMeta(table, 'relatedTableArray')).toBe(
            'related_table_array_column_id'
        );
        expect(getMeta(TestTable, 'relatedTableArray')).toBe(
            'related_table_array_column_id'
        );
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
        table.resetDirty();
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
    });

    it('should correctly evaluate dirty parameter for all cases', () => {
        const otherRelatedTable = new RelatedTable();
        const tableProperties = [
            ['string', 'test', 'test2'],
            ['number', 1, 2],
            ['boolean', true, false],
            ['relatedTable', relatedTable, otherRelatedTable],
            [
                'relatedTableArray',
                [relatedTable],
                [relatedTable, otherRelatedTable],
            ],
        ] as const;
        for (const [accessor, originalValue, newValue] of tableProperties) {
            const tableValues = table.getValues();
            table.resetDirty();
            (table[accessor] as any) = newValue;
            expect(table.isDirty()).toBe(true);
            expect(table.getDirtyValues()).toStrictEqual({
                [accessor]: newValue,
            });
            expect(table.getValues()).toStrictEqual({
                ...tableValues,
                [accessor]: newValue,
            });
            (table[accessor] as any) = originalValue;
            expect(table.isDirty()).toBe(false);
        }
    });

    it('should be passed by reference', () => {
        const table2 = table;
        table2.string = 'test2';
        expect(table.string).toBe('test2');

        function changeTable(table: TestTable) {
            table.string = 'test3';
        }
        changeTable(table2);
        expect(table.string).toBe('test3');

        const propertyTable = table.relatedTable;
        propertyTable.string = 'related2';
        expect(propertyTable.string).toBe('related2');
        expect(relatedTable.string).toBe('related2');
    });
});
