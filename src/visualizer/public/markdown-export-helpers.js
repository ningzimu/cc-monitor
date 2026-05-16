export function fileNameFromUrl(value) {
  const lastSegment = String(value || '').split('/').pop() || '';
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

export function slug(value, fallback = 'session') {
  const text = String(value || '').trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return text || fallback;
}

export function fileSlug(value, fallback = 'session') {
  const text = String(value || '').trim()
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text || fallback;
}

export function projectNameFromNativeFile(nativeFile) {
  const projectDir = String(nativeFile || '').split('/').filter(Boolean).slice(-2, -1)[0] || '';
  if (!projectDir) return '';
  const parts = projectDir.split('-').filter(Boolean);
  if (parts.length >= 3) return parts.slice(-3).join('_');
  return parts.join('_');
}
