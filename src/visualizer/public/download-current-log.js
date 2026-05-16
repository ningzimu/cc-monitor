import { buildMarkdownExport } from './trace-markdown-builder.js';
import {
  fileNameFromUrl,
  fileSlug,
  projectNameFromNativeFile,
  slug
} from './markdown-export-helpers.js';

(function attachDownloadCurrentLog(root) {
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
