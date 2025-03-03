import { CodaTable } from './CodaTable';

export const TableId =
    (tableId: string): ClassDecorator =>
    (constructor) => {
        Reflect.set(constructor, Symbol.metadata, {
            ...Reflect.get(constructor, Symbol.metadata),
            tableId,
        });
    };

const setMeta =
    <V>(value: V): PropertyDecorator =>
    (target, propertyKey) => {
        Reflect.set(target.constructor, Symbol.metadata, {
            ...Reflect.get(target.constructor, Symbol.metadata),
            [propertyKey]: value,
        });
    };
export const ColumnId = (value: string) => setMeta(value);
export const RelatedTable = (value: CodaTable) => setMeta(value);
