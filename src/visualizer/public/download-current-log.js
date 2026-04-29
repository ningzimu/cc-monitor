(function attachDownloadCurrentLog(root) {
  function fileNameFromUrl(value) {
    const lastSegment = String(value || '').split('/').pop() || '';
    try {
      return decodeURIComponent(lastSegment);
    } catch {
      return lastSegment;
    }
  }

  function resolveDownloadInfo({ currentLogUrl, localFile } = {}) {
    if (!currentLogUrl) {
      return { enabled: false };
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
    resolveDownloadInfo
  };
})(typeof window !== 'undefined' ? window : globalThis);
