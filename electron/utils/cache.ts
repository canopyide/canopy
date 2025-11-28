/**
 * Generic TTL-aware LRU cache with memory limits
 * Migrated from Canopy CLI for Electron main process.
 */

export interface CacheOptions {
	/** Maximum number of entries (LRU eviction when exceeded) */
	maxSize?: number;
	/** Default time-to-live in milliseconds */
	defaultTTL?: number;
	/** Callback when entries are evicted */
	onEvict?: (key: unknown, value: unknown) => void;
}

interface CacheEntry<V> {
	value: V;
	expiresAt: number;
	lastAccessed: number;
}

export class Cache<K, V> {
	private cache = new Map<K, CacheEntry<V>>();
	private readonly maxSize: number;
	private readonly defaultTTL: number;
	private readonly onEvict?: (key: K, value: V) => void;

	constructor(options: CacheOptions = {}) {
		this.maxSize = options.maxSize ?? 1000;
		this.defaultTTL = options.defaultTTL ?? 5000; // 5 seconds default
		this.onEvict = options.onEvict as ((key: K, value: V) => void) | undefined;
	}

	/**
	 * Get a value from the cache
	 * Returns undefined if not found or expired
	 */
	get(key: K): V | undefined {
		const entry = this.cache.get(key);
		if (!entry) {
			return undefined;
		}

		// Check expiration
		if (Date.now() > entry.expiresAt) {
			this.invalidate(key);
			return undefined;
		}

		// Update last accessed for LRU
		entry.lastAccessed = Date.now();
		return entry.value;
	}

	/**
	 * Set a value in the cache
	 * Evicts LRU entry if size limit exceeded
	 */
	set(key: K, value: V, ttl?: number): void {
		const expiresAt = Date.now() + (ttl ?? this.defaultTTL);

		this.cache.set(key, {
			value,
			expiresAt,
			lastAccessed: Date.now(),
		});

		// Enforce size limit with LRU eviction
		if (this.cache.size > this.maxSize) {
			this.evictLRU();
		}
	}

	/**
	 * Invalidate (remove) a specific key
	 */
	invalidate(key: K): void {
		const entry = this.cache.get(key);
		if (entry && this.onEvict) {
			this.onEvict(key, entry.value);
		}
		this.cache.delete(key);
	}

	/**
	 * Clear all entries
	 */
	clear(): void {
		if (this.onEvict) {
			for (const [key, entry] of this.cache) {
				this.onEvict(key, entry.value);
			}
		}
		this.cache.clear();
	}

	/**
	 * Get current cache size
	 */
	size(): number {
		return this.cache.size;
	}

	/**
	 * Check if a key exists and is not expired
	 */
	has(key: K): boolean {
		return this.get(key) !== undefined;
	}

	/**
	 * Cleanup expired entries
	 * Call this periodically to prevent memory leaks
	 */
	cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.cache) {
			if (now > entry.expiresAt) {
				this.invalidate(key);
			}
		}
	}

	/**
	 * Evict the least recently used entry
	 */
	private evictLRU(): void {
		let oldestKey: K | null = null;
		let oldestTime = Infinity;

		for (const [key, entry] of this.cache) {
			if (entry.lastAccessed < oldestTime) {
				oldestTime = entry.lastAccessed;
				oldestKey = key;
			}
		}

		if (oldestKey !== null) {
			this.invalidate(oldestKey);
		}
	}
}
