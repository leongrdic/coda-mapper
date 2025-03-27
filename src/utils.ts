import { CodaTable } from './CodaTable';

export class FetchError extends Error {
    constructor(
        message: string,
        public response: Response
    ) {
        super(message);
    }
}

export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const parseURL = (url: string, params: Record<string, string | number> = {}): string => {
    const newUrl = new URL(url);
    const searchParams = new URLSearchParams(newUrl.search);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) searchParams.set(key, String(value));
    }
    newUrl.search = searchParams.toString();
    return newUrl.toString();
};

export const parseJson = async <T>(fetchPromise: Promise<Response>): Promise<T> => {
    const response = await fetchPromise;
    if (!response.ok) {
        throw new FetchError(`Failed to fetch: ${response.statusText}`, response);
    }
    try {
        return response.json();
    } catch (e) {
        throw new FetchError(`Failed to parse JSON: ${e}`, response);
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
export const getMultiple = (target: CodaTable | (new () => CodaTable), key: string) =>
    getMeta<true | undefined>(target, `mul_${key}`) ?? false;

export const enforce = <V>(
    value: V,
    message: string
): Exclude<V, null | undefined | '' | 0 | false> => {
    if (!value) {
        throw new Error(message);
    }
    return value as Exclude<V, null | undefined | '' | 0 | false>;
};
