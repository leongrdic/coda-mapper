export class CodaTable {
  private _isDirty: boolean;
  private _original;
  constructor() {
    this._isDirty = false;
    this._original = { id: undefined };

    return new Proxy(this, {
      set(target, prop, value) {
        if (prop === "isDirty") {
          console.warn(`Cannot modify read-only property: ${prop}`);
          return false; // Prevent assignment
        }

        if (prop !== "_original") {
          target._isDirty = value !== target._original[prop];
        }

        target[prop] = value;
        return true;
      },
      get(target, prop) {
        if (prop === "isDirty") {
          return target._isDirty; // Expose but prevent modification
        }
        return target[prop];
      },
    });
  }

  getDirtyFields() {
    return Object.keys(this._original).reduce((dirty, key) => {
      if (this[key] !== this._original[key]) {
        dirty[key] = this[key];
      }
      return dirty;
    }, {});
  }

  resetDirty() {
    this._isDirty = false;
    this._original = { ...this };
  }
}
