// Minimal in-browser ZIP reader: walks the central directory and returns the spectral
// text entries. Stored entries are read directly; deflated ones are expanded with the
// browser's DecompressionStream. Nothing leaves the page.

export interface ZipEntry { name: string; method: number; data: Uint8Array }

const SPECTRAL = /\.(txt|csv|tsv|dat|asc|prn|xy)$/i;

export async function unzip(file: File): Promise<{ entries: ZipEntry[]; skipped: number }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(file.name + ' is not a readable ZIP archive');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder(), out: ZipEntry[] = [];
  let skipped = 0;
  for (let e = 0; e < count; e++) {
    if (off + 46 > buf.length || dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true), usize = dv.getUint32(off + 24, true);
    const nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(buf.subarray(off + 46, off + 46 + nlen));
    off += 46 + nlen + elen + clen;
    const leaf = name.split('/').pop() || '';
    if (name.slice(-1) === '/' || name.indexOf('__MACOSX') === 0 || leaf.charAt(0) === '.') continue;
    if (!SPECTRAL.test(leaf)) { skipped++; continue; }
    if (csize === 0xffffffff || usize === 0xffffffff) throw new Error('ZIP64 archives are not supported — please expand ' + file.name + ' locally first');
    if (method !== 0 && method !== 8) throw new Error('unsupported compression method in ' + leaf + ' — only stored and deflated entries can be read');
    const ln = dv.getUint16(lho + 26, true), le = dv.getUint16(lho + 28, true), start = lho + 30 + ln + le;
    out.push({ name: leaf, method, data: buf.subarray(start, start + csize) });
  }
  return { entries: out, skipped };
}

export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot expand deflated ZIP entries — expand the archive locally and drop the files');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
