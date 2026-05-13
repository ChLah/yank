import { md5 } from './md5';

describe('md5', () => {
  it('hashes the empty string', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });
  it('hashes "a"', () => {
    expect(md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661');
  });
  it('hashes "abc"', () => {
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
  it('hashes "message digest"', () => {
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
  });
  it('hashes the standard pangram', () => {
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe(
      '9e107d9d372bb6826bd81d3542a419d6',
    );
  });
  it('hashes non-ASCII (UTF-8 bytes)', () => {
    expect(md5('héllo')).toBe('be50e8478cf24ff3595bc7307fb91b50');
  });
});
