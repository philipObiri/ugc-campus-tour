// A permanent DOM layer for drei <Html> labels. Portaling into it (instead of the canvas wrapper)
// stops React from crashing with removeChild errors when a <Canvas> unmounts between stages.
export const labelRoot = { current: null as unknown as HTMLElement };
