export interface ImageSize {
  width: number;
  height: number;
}

const MAX_SIDE = 65_535;

const valid = (width: number, height: number): ImageSize | null =>
  width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE ? { width, height } : null;

function png(b: Uint8Array, v: DataView): ImageSize | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  return valid(v.getUint32(16), v.getUint32(20));
}

function gif(b: Uint8Array, v: DataView): ImageSize | null {
  if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
  return valid(v.getUint16(6, true), v.getUint16(8, true));
}

function jpeg(b: Uint8Array, v: DataView): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = v.getUint16(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return valid(v.getUint16(i + 7), v.getUint16(i + 5));
    }
    i += 2 + length;
  }
  return null;
}

function webp(b: Uint8Array, v: DataView): ImageSize | null {
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 30 || tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const chunk = tag(12);
  if (chunk === "VP8X") {
    return valid(1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16)));
  }
  if (chunk === "VP8L") {
    const bits = v.getUint32(21, true);
    return valid(1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff));
  }
  if (chunk === "VP8 ") return valid(v.getUint16(26, true) & 0x3fff, v.getUint16(28, true) & 0x3fff);
  return null;
}

export function imageSize(bytes: Uint8Array): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    return png(bytes, view) ?? jpeg(bytes, view) ?? gif(bytes, view) ?? webp(bytes, view);
  } catch {
    return null;
  }
}

export function fitWithin(size: ImageSize, box: number): ImageSize {
  const scale = Math.min(1, box / size.width, box / size.height);
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}
