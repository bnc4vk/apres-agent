type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export abstract class CachedProviderBase<TRequest, TCached, TResult> {
  private readonly cache = new Map<string, CacheEntry<TCached>>();

  protected abstract readonly cacheTtlMs: number;

  protected abstract cacheKey(request: TRequest): string;

  protected abstract loadFresh(request: TRequest): Promise<TCached>;

  protected project(cached: TCached, _request: TRequest): TResult {
    return cached as unknown as TResult;
  }

  async search(request: TRequest): Promise<TResult> {
    const key = this.cacheKey(request);
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return this.project(cached.value, request);
    }

    const fresh = await this.loadFresh(request);
    this.cache.set(key, {
      expiresAt: now + this.cacheTtlMs,
      value: fresh
    });
    return this.project(fresh, request);
  }
}
