import { bytesToHex } from './hex';

describe('bytesToHex', () => {
  it('encodes an empty buffer as empty string', () => {
    expect(bytesToHex(new ArrayBuffer(0))).toBe('');
  });
  it('encodes single-byte values with leading zeros', () => {
    const buf = new Uint8Array([0x00, 0x0f, 0xff]).buffer;
    expect(bytesToHex(buf)).toBe('000fff');
  });
  it('encodes multi-byte sequences in order', () => {
    const buf = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
    expect(bytesToHex(buf)).toBe('deadbeef');
  });
});
