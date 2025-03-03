import { CodaTable } from './CodaTable';

export const parseJson = async <T>(
    fetchPromise: Promise<Response>
): Promise<T> => {
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

export const getMeta = (
    target: CodaTable | (new () => CodaTable),
    key?: string
): string | undefined => {
    let actualTarget =
        target instanceof CodaTable ? target.constructor : target;
    return key
        ? (Reflect.get(actualTarget, Symbol.metadata) ?? {})[key]
        : (Reflect.get(actualTarget, Symbol.metadata) ?? {});
};

export const enforce = <V>(value: V, message: string) => {
    if (!value) {
        throw new Error(message);
    }
};
