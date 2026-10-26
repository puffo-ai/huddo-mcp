export interface ProjectionOwner {
  serverUrl: string;
  slug: string;
  generation: number;
}

export interface ProjectionToken {
  owner: ProjectionOwner;
  epoch: number;
}

export interface ProjectionSnapshot<T> {
  owner: ProjectionOwner | null;
  version: number;
  value: T;
}

type Listener = () => void;

function sameOwner(left: ProjectionOwner | null, right: ProjectionOwner): boolean {
  return left?.serverUrl === right.serverUrl
    && left.slug === right.slug
    && left.generation === right.generation;
}

export class OwnedProjectionStore<T> {
  readonly #createEmpty: () => T;
  readonly #listeners = new Set<Listener>();
  readonly #authorityListeners = new Set<Listener>();
  #epoch = 0;
  #snapshot: ProjectionSnapshot<T>;

  constructor(createEmpty: () => T) {
    this.#createEmpty = createEmpty;
    this.#snapshot = { owner: null, version: 0, value: createEmpty() };
  }

  readonly getSnapshot = (): ProjectionSnapshot<T> => this.#snapshot;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly subscribeAuthority = (listener: Listener): (() => void) => {
    this.#authorityListeners.add(listener);
    return () => this.#authorityListeners.delete(listener);
  };

  bind(owner: ProjectionOwner): ProjectionToken {
    if (!sameOwner(this.#snapshot.owner, owner)) {
      this.#epoch += 1;
      this.#emitAuthority();
      this.#snapshot = { owner: { ...owner }, version: 0, value: this.#createEmpty() };
      this.#emit();
    }
    return { owner: { ...owner }, epoch: this.#epoch };
  }

  lease(owner: ProjectionOwner): ProjectionToken {
    if (!sameOwner(this.#snapshot.owner, owner)) return this.bind(owner);
    this.#epoch += 1;
    this.#emitAuthority();
    return { owner: { ...owner }, epoch: this.#epoch };
  }

  update(token: ProjectionToken, project: (current: T) => T): boolean {
    if (!this.#accepts(token)) return false;
    const next = project(this.#snapshot.value);
    if (next === this.#snapshot.value) return true;
    this.#commit(next);
    return true;
  }

  replace(token: ProjectionToken, value: T, expectedVersion?: number): boolean {
    if (!this.#accepts(token)) return false;
    if (expectedVersion !== undefined && expectedVersion !== this.#snapshot.version) {
      return false;
    }
    this.#commit(value);
    return true;
  }

  clear(): void {
    this.#epoch += 1;
    this.#emitAuthority();
    this.#snapshot = { owner: null, version: 0, value: this.#createEmpty() };
    this.#emit();
  }

  release(token: ProjectionToken): boolean {
    if (!this.#accepts(token)) return false;
    this.clear();
    return true;
  }

  touchBound(value: T): boolean {
    if (!this.#snapshot.owner) return false;
    this.#commit(value);
    return true;
  }

  accepts(token: ProjectionToken): boolean {
    return this.#accepts(token);
  }

  #accepts(token: ProjectionToken): boolean {
    return token.epoch === this.#epoch && sameOwner(this.#snapshot.owner, token.owner);
  }

  #commit(value: T): void {
    this.#snapshot = {
      owner: this.#snapshot.owner,
      version: this.#snapshot.version + 1,
      value,
    };
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }

  #emitAuthority(): void {
    for (const listener of this.#authorityListeners) listener();
  }
}
