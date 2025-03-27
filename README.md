# CodaMapper

Welcome to **CodaMapper**, the bridge between your code and the Coda API. This library provides an elegant and type-safe way to interact with your Coda docs, mapping rows into objects and vice versa.

## Overview

Thanks to some clever proxy magic and caching, once you fetch something, it stays in memory and automatically connects to related rows. No redundant requests, no headaches.

### Persistent Instance References

When you pull a row from Coda, it doesn’t just sit there as a disconnected object. The `CodaMapper` **keeps track of every instance** and ensures that:

- If a row is fetched again, you get the **same instance (reference)**, not a duplicate.
- Relationships between tables are **automatically linked**.
- If you've already fetched related tables, those relationships are **instantly accessible** — no need to refetch anything.

### Automatic Relationship Linking

Let's say you fetch both **Contacts** and **Companies** tables. Any `Contact` that references a `Company` will already have that relationship set up.

```ts
const contact = await mapper.get(Contact, 'row-123');
const companies = await mapper.all(Company);
const myCompany = await contact.company;
console.log(myCompany.name);
// Instantly available, no extra API call.
```

Because the same instances are referenced everywhere, you never deal with stale or duplicated data. Everything stays in sync.

### Lazy Loading with `CodaReference<T>`

Of course, you won’t always fetch related tables up front. That’s where the `CodaReference<T>` type comes in. It returns a **Relation | Promise** type, just in case a relation isn't yet fetched. That means:

- If the related data **is already fetched**, it acts like a normal object.
- If it **hasn’t been fetched yet**, accessing it will **trigger a fetch on demand**.

```ts
const contacts = await mapper.all(Contact);

const company = await contacts[0].company; // Company | Promise<Company>
// Lazy Loading
console.log(company); // Company
```

This way, you don’t make unnecessary API calls, but you also don’t have to worry about whether something has been fetched or not. It just works.

### Be Careful With Circular References

Since relationships are automatically mapped, you **can** create circular references. For example, a `Company` has `employees`, and each `Employee` has a reference back to `Company`. If you're not careful, you can end up in an infinite loop.

```ts
const company = await mapper.get(Company, 'row-123');
console.log(company.employees[0].company.employees[0].company...);
// This can go on forever if you're not careful.
```

If you're dealing with recursive structures, make sure to break the chain when needed.

---

With this approach, you get **seamlessly linked, cached, and lazy-loaded data**, without ever worrying about manually stitching things together or making extra API calls. Just fetch what you need, and let the mapper handle the rest.

## That's amazing! But how do I use it?

Come take a look at what's under the hood.

### CodaTable

The `CodaTable` class is an abstract base class that represents a row in a Coda table. Think of it as your model, handling state management, change detection, and lazy fetching of related data with a hint of wizardry. Key methods include:

- **`pull()`**: Refreshes the row from Coda.

- **`push()`**: Updates the row in Coda.
- **`pushAndWait()`**: Updates the row in Coda and waits for the mutation to complete.
- **`delete()`**: Deletes the row from Coda.
- **`deleteAndWait()`**: Deletes the row from Coda and waits for the mutation to complete.
- **`isDirty()`**: Returns true if any of the rows have been changed.
- **`getValues()`**: Retrieves a copy of the current values of the row.
- **`getDirtyValues()`**: Retrieves a copy of the values that have been modified.

### CodaMapper

The `CodaMapper` class is your API communication hub. It handles the nitty-gritty of HTTP requests to Coda's API and maps the responses back into `CodaTable` objects. Methods include:

- **`get(table, id)`**: Retrieves a specific row by ID.
- **`find(table, column, value)`**: Searches for rows based on a column value.
- **`all(table)`**: Fetches all rows from a table.
- **`insert(rows)` & `insertAndWait(rows)`**: Inserts new rows into Coda.
- **`upsert(rows, upsertBy)`**: Upserts rows based on specified key columns.
- **`update(row)` & `updateAndWait(row)`**: Updates an existing row.
- **`updateBatch(rows, updateBy)` & `updateBatchAndWait(rows, updateBy)`**: Updates multiple rows at once.
- **`delete(rows)` & `deleteAndWait(rows)`**: Deletes one or more rows.

## Installation

Simply add the library to your project:

```bash
npm install coda-mapper
```

and run off into the sunset!

## Usage

### Creating a Custom CodaTable

Extend `CodaTable` to create a class representing your data structure. For example:

```ts
import { CodaTable } from './CodaTable';

/**
 * Represents a row in your "Contacts" table in Coda.
 */
@TableId('table-id')
export class Contact extends CodaTable {
  id: string;
  ⁣@ColumnId('column-id') name: string;
  ⁣@ColumnId('column-id') @Multiple emails: string[];
  ⁣@ColumnId('column-id') ⁣@References(() => Note) note: CodaRelation<Note>;
  @ColumnId('column-id') ⁣@References(() => Company) ⁣@Multiple companies: CodaRelation<Company[]>;
}

// Usage example:
const myContact = new Contact();
console.log(myContact.id); // Initially empty
```

### Using CodaMapper

Initialize the mapper with your Coda document ID and API key:

```ts
import { CodaMapper } from './CodaMapper';
import { Contact } from './Contact';

const docId = 'your-doc-id';
const apiKey = 'your-api-key';
const mapper = new CodaMapper(docId, apiKey);
```

#### Inserting Rows

```ts
const newContact = new Contact();
newContact.name = 'John Doe';
newContact.emails = ['john@example.com'];

await mapper.insert(newContact);
console.log('Contact inserted with ID:', newContact.id);

// Or wait for mutation to complete:
await mapper.insertAndWait(newContact);
console.log('Contact insertion confirmed!');
console.log('Contact inserted with ID:', newContact.id);
```

#### Fetching a Row

```ts
const fetchedContact = await mapper.get(Contact, 'row-123');

if (fetchedContact) {
    console.log('Fetched contact:', fetchedContact.getValues());
} else {
    console.log('Contact not found.');
}
```

#### Updating a Row

```ts
fetchedContact.name = 'Jane Doe'; // Modify the property

// Check if any rows have changed
if (fetchedContact.isDirty()) {
    await fetchedContact.updateAndWait();
    console.log('Contact updated successfully!');
}
```

#### Deleting a Row

```ts
await mapper.deleteAndWait(fetchedContact);
console.log('Contact deleted from Coda.');
```

#### Finding Rows

Search for contacts with a specific email:

```ts
const results = await mapper.find(Contact, 'email', 'john@example.com');
console.log(
    'Found contacts:',
    results.map((contact) => contact.getValues())
);
```

#### Fetching All Rows

```ts
const allContacts = await mapper.all(Contact);
console.log(
    'All contacts:',
    allContacts.map((contact) => contact.getValues())
);
```

#### Batch Updates

Update multiple rows at once based on a key property:

```ts
const contactsToUpdate = [
    /* array of Contact instances with valid IDs */
];
await mapper.updateBatchAndWait(contactsToUpdate);
console.log('Batch update complete!');
```

## Contributing

Contributions, bug fixes, and feature requests are more than welcome. Feel free to open an issue or submit a pull request. We’re all about making interactions with Coda as smooth as possible.

## License

This project is licensed under the [MIT License](https://opensource.org/license/mit).

---

_Happy coding! And may your rows always be in sync with Coda._
