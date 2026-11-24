/**
 * Where the built-in engine keeps uploaded PDFs, their page text, manifests, jobs and tenders.
 *
 * - Vercel Blob, when BLOB_READ_WRITE_TOKEN is set (connect a Blob store to the project): durable and
 *   shared by every function instance. Blobs are private (BLOB_ACCESS=public only if the store is a
 *   public one). Each write is a new object (key/v-<time>-<random>), and a read takes the newest, so a
 *   CDN copy of an older version is never served as current.
 * - The local disk otherwise (ANTOVA_DATA_DIR, default <tmp>/antova-native). Right for `next dev` and a
 *   single server. On Vercel without Blob it lives only as long as one function instance: health reports
 *   storage "ephemeral" so nobody mistakes it for durable.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface Store {
  readonly kind: 'blob' | 'disk' | 'r2';
  readonly durable: boolean;
  putBytes(key: string, body: Uint8Array, contentType: string): Promise<void>;
  getBytes(key: string): Promise<Uint8Array | null>;
  putJson(key: string, value: unknown): Promise<void>;
  getJson<T>(key: string): Promise<T | null>;
  /** Removes every version of `key`. */
  remove(key: string): Promise<void>;
}

/** A key segment: tender ids, job ids and file names, made safe for paths and blob names. */
export function seg(value: string): string {
  return encodeURIComponent(value).replace(/\*/g, '%2A').replace(/^\.+/, (m) => '%2E'.repeat(m.length));
}

class DiskStore implements Store {
  readonly kind = 'disk' as const;
  readonly durable: boolean;
  private readonly root: string;
  constructor(root: string, durable: boolean) {
    this.root = root;
    this.durable = durable;
  }
  private file(key: string): string {
    const full = path.resolve(this.root, ...key.split('/'));
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error(`bad store key ${key}`);
    return full;
  }
  async putBytes(key: string, body: Uint8Array): Promise<void> {
    const target = this.file(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write then rename, so a reader never sees half a file.
    const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, target);
  }
  async getBytes(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await fs.readFile(this.file(key)));
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }
  async putJson(key: string, value: unknown): Promise<void> {
    await this.putBytes(key, new TextEncoder().encode(JSON.stringify(value)));
  }
  async getJson<T>(key: string): Promise<T | null> {
    const bytes = await this.getBytes(key);
    return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : null;
  }
  async remove(key: string): Promise<void> {
    await fs.rm(this.file(key), { force: true });
  }
}

type BlobAccess = 'private' | 'public';

class BlobStore implements Store {
  readonly kind = 'blob' as const;
  readonly durable = true;
  private readonly token: string;
  private readonly access: BlobAccess;
  private readonly prefix: string;
  constructor(token: string, access: BlobAccess, prefix: string) {
    this.token = token;
    this.access = access;
    this.prefix = prefix;
  }

  private async lib() {
    return import('@vercel/blob');
  }
  private base(key: string): string {
    return `${this.prefix}${key}/v-`;
  }
  /** Every stored version of `key`, oldest first. */
  private async versions(key: string): Promise<{ pathname: string; url: string }[]> {
    const { list } = await this.lib();
    const out: { pathname: string; url: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: this.base(key), cursor, limit: 1000, token: this.token });
      out.push(...page.blobs.map((b) => ({ pathname: b.pathname, url: b.url })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out.sort((a, b) => a.pathname.localeCompare(b.pathname));
  }
  async putBytes(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const { put, del } = await this.lib();
    const older = await this.versions(key);
    const name = `${this.base(key)}${Date.now().toString().padStart(15, '0')}-${Math.random().toString(36).slice(2, 8)}`;
    await put(name, Buffer.from(body), {
      access: this.access,
      contentType,
      addRandomSuffix: false,
      token: this.token,
    } as any);
    // Keep the previous version a moment for a reader that listed before this write.
    const stale = older.slice(0, -1).map((v) => v.url);
    if (stale.length) await del(stale, { token: this.token }).catch(() => undefined);
  }
  async getBytes(key: string): Promise<Uint8Array | null> {
    const latest = (await this.versions(key)).pop();
    if (!latest) return null;
    const { get } = await this.lib();
    const result: any = await get(latest.url, { access: this.access, token: this.token } as any);
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return new Uint8Array(await new Response(result.stream as ReadableStream).arrayBuffer());
  }
  async putJson(key: string, value: unknown): Promise<void> {
    await this.putBytes(key, new TextEncoder().encode(JSON.stringify(value)), 'application/json');
  }
  async getJson<T>(key: string): Promise<T | null> {
    const bytes = await this.getBytes(key);
    return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : null;
  }
  async remove(key: string): Promise<void> {
    const { del } = await this.lib();
    const urls = (await this.versions(key)).map((v) => v.url);
    if (urls.length) await del(urls, { token: this.token });
  }
}

/** The R2 bucket binding's methods this store uses (see wrangler.jsonc, binding ANTOVA_BUCKET). */
interface R2BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
}

/**
 * Cloudflare R2, on the Workers deploy. Private (no public URL) and strongly consistent, so a key is
 * simply overwritten: a read after a write always sees the write.
 */
class R2Store implements Store {
  readonly kind = 'r2' as const;
  readonly durable = true;
  private readonly bucket: R2BucketLike;
  constructor(bucket: R2BucketLike) {
    this.bucket = bucket;
  }
  async putBytes(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.bucket.put(`antova-native/${key}`, body, { httpMetadata: { contentType } });
  }
  async getBytes(key: string): Promise<Uint8Array | null> {
    const obj = await this.bucket.get(`antova-native/${key}`);
    return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
  }
  async putJson(key: string, value: unknown): Promise<void> {
    await this.putBytes(key, new TextEncoder().encode(JSON.stringify(value)), 'application/json');
  }
  async getJson<T>(key: string): Promise<T | null> {
    const bytes = await this.getBytes(key);
    return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : null;
  }
  async remove(key: string): Promise<void> {
    await this.bucket.delete(`antova-native/${key}`);
  }
}

/** The ANTOVA_BUCKET binding when running as a Cloudflare Worker, else null. */
function r2Bucket(): R2BucketLike | null {
  try {
    // Present only inside the Workers runtime (OpenNext puts the request context on this symbol).
    const ctx = (globalThis as any)[Symbol.for('__cloudflare-context__')];
    const bucket = ctx?.env?.ANTOVA_BUCKET;
    return bucket && typeof bucket.put === 'function' ? (bucket as R2BucketLike) : null;
  } catch {
    return null;
  }
}

let cached: Store | null = null;

export function getStore(env: Record<string, string | undefined> = process.env): Store {
  const bucket = r2Bucket();
  if (bucket) return new R2Store(bucket);
  if (cached) return cached;
  const token = (env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (token) {
    const access: BlobAccess = env.BLOB_ACCESS === 'public' ? 'public' : 'private';
    cached = new BlobStore(token, access, 'antova-native/');
  } else {
    // Built at run time so the build's file tracer does not mistake the temp folder for a file to bundle.
    const folder: Record<string, string> = { name: 'antova-native' };
    const root = (env.ANTOVA_DATA_DIR || '').trim() || path.join(env.TMPDIR || env.TEMP || env.TMP || '/tmp', folder[Object.keys(folder)[0]]);
    // A serverless instance's disk goes away with the instance; a long-running server's does not.
    cached = new DiskStore(root, !env.VERCEL);
  }
  return cached;
}
