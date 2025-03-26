import { CodaTable } from './CodaTable';

declare global {
    interface SymbolConstructor {
        readonly metadata: unique symbol;
    }
}

export type RecursiveHelper<T> = T | Array<T | RecursiveHelper<T>>;
export type CodaRelation<T extends CodaTable | CodaTable[]> =
    T extends Array<infer U> ? U[] : T | Promise<T extends Array<infer U> ? U[] : T>;

export type CodaGetRowsQuery = {
    query?: `"${string}":${string}`;
    sortBy?: 'createdAt' | 'natural' | 'updatedAt';
    useColumnNames?: boolean;
    valueFormat?: 'simple' | 'simpleWithArrays' | 'rich';
    visibleOnly?: boolean;
    limit?: number;
    pageToken?: string;
    syncToken?: string;
};
export type CodaPostRowsQuery = {
    disableParsing?: boolean;
};
export type CodaPostRowsRequest = {
    rows: {
        cells: {
            column: string;
            value: RecursiveHelper<string | number | boolean>;
        }[];
    }[];
    keyColumns?: string[];
};
export type CodaDeleteRowsQuery = {};
export type CodaDeleteRowsRequest = {
    rowIds: string[];
};
export type CodaGetRowQuery = {
    useColumnNames?: boolean;
    valueFormat?: 'simple' | 'simpleWithArrays' | 'rich';
};
export type CodaPutRowQuery = {
    disableParsing?: boolean;
};
export type CodaPutRowRequest = {
    row: {
        cells: {
            column: string;
            value: RecursiveHelper<string | number | boolean>;
        }[];
    };
};
export type CodaDeleteRowQuery = {};
export type CodaDeleteRowRequest = {};

export type CodaRowResponse = CodaRow & {
    parent: {
        id: string;
        type: 'table';
        tableType: 'table' | 'view';
        browserLink: string;
        href: string;
        name: string;
        parent: {
            id: string;
            type: 'page';
            browserLink: string;
            href: string;
            name: string;
        };
    };
};
export type CodaInsertResponse = {
    requestId: string;
    addedRowIds: string[];
};
export type CodaUpsertResponse = {
    requestId: string;
};
export type CodaUpdateResponse = {
    requestId: string;
    id: string;
};
export type CodaDeleteResponse = {
    requestId: string;
    rowIds: string[];
};
export type CodaMutationStatusResponse = {
    completed: boolean;
    warning?: string;
};
export type CodaRowsResponse = {
    items: CodaRow[];
    href: string;
    nextSyncToken: string;
} & (
    | {
          nextPageToken: string;
          nextPageLink: string;
      }
    | {}
);
export type CodaRow = {
    id: string;
    type: 'row';
    href: string;
    name: string;
    index: number;
    browserLink: string;
    createdAt: string;
    updatedAt: string;
    values: Record<string, CodaRowValue>;
};
export type CodaRowValue =
    | string
    | number
    | boolean
    | `\`\`\`${string}\`\`\``
    | {
          '@context': 'http://schema.org';
          '@type': 'MonetaryAmount';
          currency: string;
          amount: number;
      }
    | {
          '@context': 'http://schema.org';
          '@type': 'StructuredValue';
          additionalType: 'row';
          name: string;
          rowId: string;
          tableId: string;
          tableUrl: string;
          url: string;
      }
    | {
          '@context': 'http://schema.org';
          '@type': 'WebPage';
          name: string;
          url: string;
      }
    | {
          '@context': 'http://schema.org';
          '@type': 'ImageObject';
          name: string;
          url: string;
      }
    | {
          '@context': 'http://schema.org';
          '@type': 'Person';
          name: string;
          email: string;
      }
    | CodaRowValue[];
