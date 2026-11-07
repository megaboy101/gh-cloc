// Minimal streaming tar reader (ustar + pax + GNU long names).
// Consumes a ReadableStream<Uint8Array> of the *decompressed* archive and yields
// entries one at a time, so huge repositories never sit in memory all at once.

class ByteReader {
  constructor(stream) {
    this.reader = stream.getReader();
    this.chunks = [];
    this.buffered = 0;
    this.done = false;
  }

  async fill(n) {
    while (this.buffered < n && !this.done) {
      const { value, done } = await this.reader.read();
      if (done) { this.done = true; break; }
      if (value.length) { this.chunks.push(value); this.buffered += value.length; }
    }
    return this.buffered >= n;
  }

  /** Read exactly n bytes, or null if the stream ends first. */
  async read(n) {
    if (n === 0) return new Uint8Array(0);
    if (!(await this.fill(n))) return null;
    const first = this.chunks[0];
    if (first.length >= n) {
      const out = first.subarray(0, n);
      if (first.length === n) this.chunks.shift();
      else this.chunks[0] = first.subarray(n);
      this.buffered -= n;
      return out;
    }
    const out = new Uint8Array(n);
    let off = 0;
    while (off < n) {
      const c = this.chunks[0];
      const take = Math.min(c.length, n - off);
      out.set(c.subarray(0, take), off);
      off += take;
      if (take === c.length) this.chunks.shift();
      else this.chunks[0] = c.subarray(take);
    }
    this.buffered -= n;
    return out;
  }

  /** Discard n bytes without copying them. */
  async skip(n) {
    while (n > 0) {
      if (!this.buffered && !(await this.fill(1))) return false;
      const c = this.chunks[0];
      if (c.length <= n) { n -= c.length; this.buffered -= c.length; this.chunks.shift(); }
      else { this.chunks[0] = c.subarray(n); this.buffered -= n; n = 0; }
    }
    return true;
  }

  cancel() { return this.reader.cancel().catch(() => {}); }
}

const ascii = new TextDecoder('utf-8');

function str(buf, off, len) {
  let end = off;
  const max = off + len;
  while (end < max && buf[end] !== 0) end++;
  return ascii.decode(buf.subarray(off, end));
}

function num(buf, off, len) {
  // Base-256 encoding (GNU) for sizes >= 8 GiB.
  if (buf[off] & 0x80) {
    let v = buf[off] & 0x7f;
    for (let i = 1; i < len; i++) v = v * 256 + buf[off + i];
    return v;
  }
  const s = str(buf, off, len).trim();
  return s ? parseInt(s, 8) : 0;
}

function parsePax(data) {
  const out = {};
  const text = ascii.decode(data);
  let i = 0;
  while (i < text.length) {
    const sp = text.indexOf(' ', i);
    if (sp === -1) break;
    const len = parseInt(text.slice(i, sp), 10);
    if (!len) break;
    // Length is in bytes; for ASCII keys this is close enough to slice on chars,
    // but use the newline terminator to be robust with UTF-8 values.
    const nl = text.indexOf('\n', sp);
    const record = text.slice(sp + 1, nl === -1 ? undefined : nl);
    const eq = record.indexOf('=');
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    i = nl === -1 ? text.length : nl + 1;
  }
  return out;
}

const pad = (n) => (512 - (n % 512)) % 512;

/**
 * @param {ReadableStream<Uint8Array>} stream
 * @param {(entry: {path: string, size: number, type: string}) => boolean} wantData
 *        return true to receive entry.data for a regular file
 * @yields {{ path, size, type, data?: Uint8Array, global?: object }}
 */
export async function* readTar(stream, wantData) {
  const r = new ByteReader(stream);
  let paxNext = null;
  let longName = null;
  try {
    while (true) {
      const h = await r.read(512);
      if (!h) return;
      if (h.every((b) => b === 0)) return; // end-of-archive marker

      const type = String.fromCharCode(h[156] || 48); // NUL → '0'
      let size = num(h, 124, 12);
      let path = str(h, 0, 100);
      if (str(h, 257, 5) === 'ustar') {
        const prefix = str(h, 345, 155);
        if (prefix) path = `${prefix}/${path}`;
      }

      if (type === 'x' || type === 'g' || type === 'L') {
        const data = await r.read(size);
        if (!data) return;
        await r.skip(pad(size));
        if (type === 'x') paxNext = parsePax(data);
        else if (type === 'L') longName = str(data, 0, data.length);
        else yield { type: 'g', path: '', size, global: parsePax(data) };
        continue;
      }

      if (longName) { path = longName; longName = null; }
      if (paxNext) {
        if (paxNext.path) path = paxNext.path;
        if (paxNext.size) size = Number(paxNext.size);
        paxNext = null;
      }

      const entry = { path, size, type };
      const isFile = type === '0' || type === '7';
      if (isFile && wantData(entry)) {
        const data = await r.read(size);
        if (!data) return;
        entry.data = data;
        await r.skip(pad(size));
      } else {
        await r.skip(size + pad(size));
      }
      yield entry;
    }
  } finally {
    await r.cancel();
  }
}
