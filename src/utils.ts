import { CodaTable } from './CodaTable';

export const parseJson = async <T>(fetchPromise: Promise<Response>): Promise<T> => {
    const response = await fetchPromise;
    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    try {
        return response.json() as Promise<T>;
    } catch (e) {
        throw new Error(`Failed to parse JSON: ${e}`);
    }
};

const getMeta = <R = string>(
    target: CodaTable | (new () => CodaTable),
    key?: string
): R | undefined => {
    const actualTarget = target instanceof CodaTable ? target.constructor : target;
    const metadata = Reflect.get(actualTarget, Symbol.metadata) ?? {};
    return key ? metadata[key] : metadata;
};
export const getTableId = (target: CodaTable | (new () => CodaTable)) => getMeta(target, 'tableId');
export const getColumnId = (target: CodaTable | (new () => CodaTable), key: string) =>
    getMeta(target, `col_${key}`);
export const getRelation = (target: CodaTable | (new () => CodaTable), key: string) =>
    getMeta<() => new () => CodaTable>(target, `rel_${key}`)?.();

export const enforce = <V>(
    value: V,
    message: string
): Exclude<V, null | undefined | '' | 0 | false> => {
    if (!value) {
        throw new Error(message);
    }
    return value as Exclude<V, null | undefined | '' | 0 | false>;
};
