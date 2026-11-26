/** "512 B", "2.0 KB", "412 KB", "24.6 MB", "1.2 GB". */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  // Step up a unit when rounding would print 1024 of the smaller one ("1024 KB", "1024.0 MB").
  if (Math.round(kb) < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (Number(mb.toFixed(1)) < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
