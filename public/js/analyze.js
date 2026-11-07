import { readTar } from './tar.js';
import { countLines } from './counter.js';
import { LANGS, detectByPath, detectByShebang, isExtensionless } from './languages.js';

const MAX_FILE_BYTES = 16 * 1024 * 1024; // larger files are almost always data/generated
const decoder = new TextDecoder('utf-8');

function looksBinary(bytes) {
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}

/**
 * Analyze a gzipped GitHub tarball stream.
 * @param {ReadableStream<Uint8Array>} gzStream
 * @param {(p: {bytes: number, files: number}) => void} onProgress
 * @returns {Promise<{ files: Array<{path, lang, code, comment, blank}>, ignored: number, commit: string|null, bytes: number }>}
 */
export async function analyzeTarball(gzStream, onProgress = () => {}) {
  let bytes = 0;
  const counted = gzStream.pipeThrough(new TransformStream({
    transform(chunk, ctl) { bytes += chunk.length; ctl.enqueue(chunk); },
  }));
  const tar = counted.pipeThrough(new DecompressionStream('gzip'));

  const files = [];
  let ignored = 0;
  let commit = null;
  let lastReport = 0;

  const relPath = (p) => {
    // GitHub tarballs wrap everything in "<owner>-<repo>-<sha>/".
    const i = p.indexOf('/');
    return i === -1 ? '' : p.slice(i + 1);
  };

  const wantData = (e) => {
    const rel = relPath(e.path);
    if (!rel || e.size > MAX_FILE_BYTES) return false;
    e.rel = rel;
    e.lang = detectByPath(rel);
    return e.lang !== null || (isExtensionless(rel) && e.size < 1024 * 1024);
  };

  for await (const e of readTar(tar, wantData)) {
    if (e.type === 'g') { commit = e.global.comment ?? null; continue; }
    if (e.type !== '0' && e.type !== '7') continue;

    if (!e.data) { ignored++; }
    else if (looksBinary(e.data)) { ignored++; }
    else {
      const text = decoder.decode(e.data);
      let lang = e.lang;
      if (!lang) {
        const nl = text.indexOf('\n');
        lang = detectByShebang(text.slice(0, nl === -1 ? 200 : nl));
      }
      if (!lang) { ignored++; }
      else {
        const { code, comment, blank } = countLines(text, LANGS.get(lang));
        files.push({ path: e.rel, lang, code, comment, blank });
      }
    }

    const now = Date.now();
    if (now - lastReport > 120) {
      lastReport = now;
      onProgress({ bytes, files: files.length + ignored });
    }
  }
  onProgress({ bytes, files: files.length + ignored });
  return { files, ignored, commit, bytes };
}
