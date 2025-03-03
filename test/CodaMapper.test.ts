import { CodaMapper, CodaTable, TableId } from '../src';

const mapper = new CodaMapper('doc_id', 'api_key');

describe('CodaMapper module', () => {
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
            readonly id: string;
        }
        expect(mapper.get(TestTable, 'some_column_id')).rejects.toThrow(
            'TableId not set for class TestTable'
        );
    });
    it('should throw an error if no columnId is provided', () => {
        @TableId('table_id')
        class TestTable extends CodaTable {
            readonly id: string;
        }
        expect(mapper.get(TestTable, 'some_column_id')).rejects.toThrow(
            'ColumnId not set for property id in class TestTable'
        );
    });
});
