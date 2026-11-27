function invalid(): never { throw new Error("Unsupported voice audio."); }
export function decodeVoice(bytes: Uint8Array<ArrayBuffer>, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (pos: number) => String.fromCharCode(...bytes.subarray(pos, pos + 4));
  let rate = 0, length = 0, wav = bytes;
  if (/^audio\/(?:wav|x-wav|wave)(?:;|$)/i.test(mime)) {
    if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE" || view.getUint32(4, true) !== bytes.length - 8) invalid();
    for (let pos = 12; pos < bytes.length;) {
      if (pos + 8 > bytes.length) invalid();
      const size = view.getUint32(pos + 4, true), start = pos + 8, next = start + size + (size % 2);
      if (next > bytes.length) invalid();
      if (tag(pos) === "fmt ") {
        if (rate || size < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1 || view.getUint16(start + 14, true) !== 16) invalid();
        rate = view.getUint32(start + 4, true);
        if (view.getUint16(start + 12, true) !== 2 || view.getUint32(start + 8, true) !== rate * 2) invalid();
      } else if (tag(pos) === "data") { if (length || !size) invalid(); length = size; }
      pos = next;
    }
  } else {
    if (!/^audio\/L16(?:;|$)/i.test(mime) || /;\s*channels=(?!1(?:;|$))/i.test(mime)) invalid();
    rate = Number(/;\s*rate=(\d+)(?:;|$)/i.exec(mime)?.[1]); length = bytes.length;
    if (rate >= 16000 && rate <= 48000 && length && !(length % 2)) {
      wav = new Uint8Array(44 + length); const out = new DataView(wav.buffer);
      const label = (pos: number, text: string) => wav.set(new TextEncoder().encode(text), pos);
      label(0, "RIFF"); out.setUint32(4, length + 36, true); label(8, "WAVEfmt "); out.setUint32(16, 16, true);
      out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true);
      out.setUint16(32, 2, true); out.setUint16(34, 16, true); label(36, "data"); out.setUint32(40, length, true); wav.set(bytes, 44);
    }
  }
  if (!(rate >= 16000 && rate <= 48000) || !length || length % 2) invalid();
  return { blob: new Blob([wav], { type: "audio/wav" }), duration: length / (rate * 2) };
}
