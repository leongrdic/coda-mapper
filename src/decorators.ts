import { CodaTable } from './CodaTable';

export const TableId =
    (tableId: string): ClassDecorator =>
    (constructor) => {
        Reflect.set(constructor, Symbol.metadata, {
            ...Reflect.get(constructor, Symbol.metadata),
            tableId,
        });
    };

export const ColumnId =
    (value: string): PropertyDecorator =>
    (target, propertyKey) => {
        Reflect.set(target.constructor, Symbol.metadata, {
            ...Reflect.get(target.constructor, Symbol.metadata),
            [`col_${String(propertyKey)}`]: value,
        });
    };

export const References =
    <V extends CodaTable>(value: () => new () => V): PropertyDecorator =>
    (target, propertyKey) => {
        Reflect.set(target.constructor, Symbol.metadata, {
            ...Reflect.get(target.constructor, Symbol.metadata),
            [`rel_${String(propertyKey)}`]: value,
        });
    };
export const Multiple: PropertyDecorator = (target, propertyKey) => {
    Reflect.set(target.constructor, Symbol.metadata, {
        ...Reflect.get(target.constructor, Symbol.metadata),
        [`mul_${String(propertyKey)}`]: true,
    });
};
