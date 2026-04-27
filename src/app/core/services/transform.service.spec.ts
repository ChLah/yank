import { TransformService } from './transform.service';

describe('TransformService', () => {
  let service: TransformService;
  beforeEach(() => { service = new TransformService(); });

  it('strip-whitespace trims and collapses internal spaces', () => {
    expect(service.apply('strip-whitespace', '  hello   world  ')).toEqual({ ok: true, value: 'hello world' });
  });
  it('uppercase converts to upper case', () => {
    expect(service.apply('uppercase', 'hello world')).toEqual({ ok: true, value: 'HELLO WORLD' });
  });
  it('lowercase converts to lower case', () => {
    expect(service.apply('lowercase', 'HELLO WORLD')).toEqual({ ok: true, value: 'hello world' });
  });
  it('title-case capitalizes first letter of each word', () => {
    expect(service.apply('title-case', 'hello world foo')).toEqual({ ok: true, value: 'Hello World Foo' });
  });
  it('url-encode encodes special characters', () => {
    expect(service.apply('url-encode', 'hello world&foo=1')).toEqual({ ok: true, value: 'hello%20world%26foo%3D1' });
  });
  it('url-decode decodes an encoded string', () => {
    expect(service.apply('url-decode', 'hello%20world')).toEqual({ ok: true, value: 'hello world' });
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
    expect(service.apply('strip-html', '<b>hello</b> <i>world</i>')).toEqual({ ok: true, value: 'hello world' });
  });
  it('options list contains all 8 transforms', () => {
    expect(service.options).toHaveLength(8);
    const ids = service.options.map(o => o.id);
    expect(ids).toContain('strip-whitespace');
    expect(ids).toContain('json-format');
    expect(ids).toContain('strip-html');
  });
});
