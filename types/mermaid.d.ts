declare module 'mermaid' {
  export interface MermaidRenderResult {
    svg: string;
    bindFunctions?: (element: Element) => void;
  }

  export interface MermaidAPI {
    initialize: (config: Record<string, unknown>) => void;
    render: (id: string, text: string) => Promise<MermaidRenderResult>;
  }

  const mermaid: MermaidAPI;
  export default mermaid;
}
