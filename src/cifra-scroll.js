export const CIFRA_SCROLL_PIXELS_PER_MS=0.018;
export function advanceCifraScroll(position,elapsedMs,speed){const elapsed=Math.max(0,Math.min(100,Number(elapsedMs)||0));return Number(position||0)+elapsed*CIFRA_SCROLL_PIXELS_PER_MS*Math.max(0,Number(speed)||0);}
