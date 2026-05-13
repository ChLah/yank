import { TransformService } from './transform.service';

describe('TransformService', () => {
  let service: TransformService;
  beforeEach(() => {
    service = new TransformService();
  });

  it('strip-whitespace trims and collapses internal spaces', () => {
    expect(service.apply('strip-whitespace', '  hello   world  ')).toEqual({
      ok: true,
      value: 'hello world',
    });
  });
  it('uppercase converts to upper case', () => {
    expect(service.apply('uppercase', 'hello world')).toEqual({ ok: true, value: 'HELLO WORLD' });
  });
  it('lowercase converts to lower case', () => {
    expect(service.apply('lowercase', 'HELLO WORLD')).toEqual({ ok: true, value: 'hello world' });
  });
  it('title-case capitalizes first letter of each word', () => {
    expect(service.apply('title-case', 'hello world foo')).toEqual({
      ok: true,
      value: 'Hello World Foo',
    });
  });
  it('url-encode encodes special characters', () => {
    expect(service.apply('url-encode', 'hello world&foo=1')).toEqual({
      ok: true,
      value: 'hello%20world%26foo%3D1',
    });
  });
  it('url-decode decodes an encoded string', () => {
    expect(service.apply('url-decode', 'hello%20world')).toEqual({
      ok: true,
      value: 'hello world',
    });
  });
  it('url-decode returns error on invalid encoding', () => {
    const r = service.apply('url-decode', '%invalid');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TRANSFORM.ERROR_URL_DECODE');
  });
  it('json-format formats valid JSON with 2-space indent', () => {
    expect(service.apply('json-format', '{"a":1}')).toEqual({ ok: true, value: '{\n  "a": 1\n}' });
  });
  it('json-format returns error on invalid JSON', () => {
    const r = service.apply('json-format', 'not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TRANSFORM.ERROR_JSON');
  });
  it('strip-html removes all HTML tags', () => {
    expect(service.apply('strip-html', '<b>hello</b> <i>world</i>')).toEqual({
      ok: true,
      value: 'hello world',
    });
  });
  it('base64-encode encodes ASCII text', () => {
    expect(service.apply('base64-encode', 'foo')).toEqual({ ok: true, value: 'Zm9v' });
  });
  it('base64-encode handles non-ASCII (UTF-8)', () => {
    expect(service.apply('base64-encode', 'héllo')).toEqual({ ok: true, value: 'aMOpbGxv' });
  });
  it('base64-decode decodes back to original UTF-8 string', () => {
    expect(service.apply('base64-decode', 'aMOpbGxv')).toEqual({ ok: true, value: 'héllo' });
  });
  it('base64-decode returns error on invalid base64', () => {
    const r = service.apply('base64-decode', '!!!not-base64!!!');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TRANSFORM.ERROR_BASE64_DECODE');
  });
  it('remove-duplicate-lines removes repeated lines and preserves first occurrence order', () => {
    expect(service.apply('remove-duplicate-lines', 'a\nb\na\nc\nb')).toEqual({
      ok: true,
      value: 'a\nb\nc',
    });
  });
  it('remove-duplicate-lines on input without duplicates is a no-op', () => {
    expect(service.apply('remove-duplicate-lines', 'a\nb\nc')).toEqual({
      ok: true,
      value: 'a\nb\nc',
    });
  });
  it('sort-lines-asc sorts lines alphabetically (case-insensitive via localeCompare)', () => {
    expect(service.apply('sort-lines-asc', 'banana\napple\ncherry')).toEqual({
      ok: true,
      value: 'apple\nbanana\ncherry',
    });
  });
  it('sort-lines-asc handles single-line input as a no-op', () => {
    expect(service.apply('sort-lines-asc', 'only')).toEqual({ ok: true, value: 'only' });
  });
  it('slugify lowercases and joins words with hyphens', () => {
    expect(service.apply('slugify', 'Hello World')).toEqual({ ok: true, value: 'hello-world' });
  });
  it('slugify strips diacritics', () => {
    expect(service.apply('slugify', 'Café Déjà Vu')).toEqual({ ok: true, value: 'cafe-deja-vu' });
  });
  it('slugify collapses non-alphanumeric runs into a single hyphen and trims edges', () => {
    expect(service.apply('slugify', '  Foo!! @#  Bar  ')).toEqual({ ok: true, value: 'foo-bar' });
  });
  it('slugify produces empty string when no alphanumerics remain', () => {
    expect(service.apply('slugify', '!!! ???')).toEqual({ ok: true, value: '' });
  });
  it('isAsync returns true for hash IDs and false for sync IDs', () => {
    expect(service.isAsync('hash-md5')).toBe(true);
    expect(service.isAsync('hash-sha1')).toBe(true);
    expect(service.isAsync('hash-sha256')).toBe(true);
    expect(service.isAsync('uppercase')).toBe(false);
    expect(service.isAsync('base64-encode')).toBe(false);
  });
  it('applyAsync("hash-md5", "abc") returns the MD5 hex digest', async () => {
    await expect(service.applyAsync('hash-md5', 'abc')).resolves.toEqual({
      ok: true,
      value: '900150983cd24fb0d6963f7d28e17f72',
    });
  });
  it('applyAsync("hash-md5", "") returns the empty-string MD5', async () => {
    await expect(service.applyAsync('hash-md5', '')).resolves.toEqual({
      ok: true,
      value: 'd41d8cd98f00b204e9800998ecf8427e',
    });
  });
  it('applyAsync("hash-sha1", "abc") returns the SHA-1 hex digest', async () => {
    await expect(service.applyAsync('hash-sha1', 'abc')).resolves.toEqual({
      ok: true,
      value: 'a9993e364706816aba3e25717850c26c9cd0d89d',
    });
  });
  it('applyAsync("hash-sha1", "") returns the empty-string SHA-1', async () => {
    await expect(service.applyAsync('hash-sha1', '')).resolves.toEqual({
      ok: true,
      value: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
    });
  });
  it('options list contains all expected IDs (current state)', () => {
    expect(service.options.map((o) => o.id)).toEqual([
      'strip-whitespace',
      'uppercase',
      'lowercase',
      'title-case',
      'url-encode',
      'url-decode',
      'base64-encode',
      'base64-decode',
      'json-format',
      'strip-html',
      'remove-duplicate-lines',
      'sort-lines-asc',
      'slugify',
      'hash-md5',
      'hash-sha1',
    ]);
  });
});
