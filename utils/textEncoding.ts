export const decodeLatin1 = (value?: string): string | undefined => {
  if (!value) return value;
  if (!/[\u00C0-\u00FF]/.test(value)) return value;

  const codes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    codes[i] = value.charCodeAt(i);
  }

  try {
    // Re-interpret as UTF-8 bytes
    return new TextDecoder('utf-8').decode(codes);
  } catch {
    return value;
  }
};
