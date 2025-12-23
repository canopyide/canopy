/* eslint-disable no-control-regex */
const ansiPattern = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

const oscPattern = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;

const dcsPattern = /\u001bP[^\u001b]*(?:\u001b\\)/g;
/* eslint-enable no-control-regex */

export function stripAnsi(text: string): string {
  return text.replace(ansiPattern, "").replace(oscPattern, "").replace(dcsPattern, "");
}
