import { buildMarkdownExport } from './trace-markdown-builder.js';

(function attachDownloadCurrentLog(root) {
  function fileNameFromUrl(value) {
    const lastSegment = String(value || '').split('/').pop() || '';
    try {
      return decodeURIComponent(lastSegment);
    } catch {
      return lastSegment;
    }
  }

  function slug(value, fallback = 'session') {
    const text = String(value || '').trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return text || fallback;
  }

  function fileSlug(value, fallback = 'session') {
    const text = String(value || '').trim()
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return text || fallback;
  }

  function projectNameFromNativeFile(nativeFile) {
    const projectDir = String(nativeFile || '').split('/').filter(Boolean).slice(-2, -1)[0] || '';
    if (!projectDir) return '';
    const parts = projectDir.split('-').filter(Boolean);
    if (parts.length >= 3) return parts.slice(-3).join('_');
    return parts.join('_');
  }

  function buildDownloadMarkdownExport(args = {}) {
    return buildMarkdownExport({
      ...args,
      fileNameFromUrl,
      slug,
      fileSlug,
      projectNameFromNativeFile
    });
  }

  function resolveDownloadInfo({ currentLogUrl, localFile } = {}) {
    const args = arguments[0] || {};
    if (!currentLogUrl) {
      return { enabled: false };
    }

    if (args.parsedData && Array.isArray(args.conversations)) {
      const exported = buildDownloadMarkdownExport(args);
      return {
        enabled: true,
        kind: 'blob',
        text: exported.text,
        fileName: exported.fileName,
        mimeType: 'text/markdown'
      };
    }

    if (localFile?.text != null) {
      return {
        enabled: true,
        kind: 'blob',
        text: localFile.text,
        fileName: localFile.name || 'claude-code-lens-session.json'
      };
    }

    return {
      enabled: true,
      kind: 'remote',
      href: currentLogUrl,
      fileName: fileNameFromUrl(currentLogUrl) || 'claude-code-lens-session.json'
    };
  }

  root.CCLensDownloadCurrentLog = {
    resolveDownloadInfo,
    buildMarkdownExport: buildDownloadMarkdownExport
  };

  if (typeof root.dispatchEvent === 'function' && typeof root.Event === 'function') {
    root.dispatchEvent(new root.Event('cclens-download-export-ready'));
  }
})(typeof window !== 'undefined' ? window : globalThis);
