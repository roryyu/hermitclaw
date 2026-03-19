declare module 'marked-terminal' {
  interface TerminalRendererOptions {
    code?: string;
    heading?: string;
    em?: string;
    strong?: string;
    blockquote?: string;
    listitem?: string;
    tableOptions?: Record<string, unknown>;
  }

  function markedTerminal(options?: TerminalRendererOptions): object;
  export default markedTerminal;
}
