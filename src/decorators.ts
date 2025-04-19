import type { CodaTable } from './CodaTable';

/**
 * Tells CodaTable what the tableId is for this class.
 *
 * Without this decorator, how would CodaTable know what tableId to use?
 */
export const TableId =
    (tableId: string): ClassDecorator =>
    (constructor) => {
        Reflect.set(constructor, Symbol.metadata, {
            ...Reflect.get(constructor, Symbol.metadata),
            tableId,
        });
    };

/**
 * Tells CodaTable what the columnId is for this property.
 *
 * Without this decorator, how would CodaTable know what columnId to use?
 */
export const ColumnId =
    (value: string): PropertyDecorator =>
    (target, propertyKey) => {
        Reflect.set(target.constructor, Symbol.metadata, {
            ...Reflect.get(target.constructor, Symbol.metadata),
            [`col_${String(propertyKey)}`]: value,
        });
    };

/**
 * This is a special decorator that tells CodaTable that this property is a reference to another table.
 *
 * Make sure to pass in a **function** that returns the class of the table you want to reference.
 */
export const References =
    <V extends CodaTable>(value: () => new () => V): PropertyDecorator =>
    (target, propertyKey) => {
        Reflect.set(target.constructor, Symbol.metadata, {
            ...Reflect.get(target.constructor, Symbol.metadata),
            [`rel_${String(propertyKey)}`]: value,
        });
    };
/**
 * Due to Coda's API limitations, we need to use this decorator to indicate that this property is an array.
 */
export const Multiple: PropertyDecorator = (target, propertyKey) => {
    Reflect.set(target.constructor, Symbol.metadata, {
        ...Reflect.get(target.constructor, Symbol.metadata),
        [`mul_${String(propertyKey)}`]: true,
    });
};
