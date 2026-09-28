const MARKDOWN_PACKAGE = /[\\/]@codemirror[\\/]lang-markdown[\\/]/;

export function markdownHtmlStubPlugin(stub: string) {
  return {
    name: "emdy-markdown-html-stub",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      if (source !== "@codemirror/lang-html" || !importer || !MARKDOWN_PACKAGE.test(importer))
        return null;
      return stub;
    },
  };
}
