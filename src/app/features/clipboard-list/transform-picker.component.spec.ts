import { TransformPickerComponent } from './transform-picker.component';
import { TransformService } from '../../core/services/transform.service';
import { TransformResult } from '../../core/services/transform.service';

describe('TransformPickerComponent', () => {
  it('is defined', () => {
    expect(TransformPickerComponent).toBeDefined();
  });

  describe('TransformService integration (via TransformPickerComponent logic)', () => {
    let service: TransformService;

    beforeEach(() => {
      service = new TransformService();
    });

    it('apply returns ok for all safe synchronous transform types on a sample string', () => {
      const sample = 'hello world';
      const safeSync = service.options.filter(
        (o) =>
          o.id !== 'url-decode' &&
          o.id !== 'json-format' &&
          o.id !== 'base64-decode' &&
          !service.isAsync(o.id),
      );
      for (const opt of safeSync) {
        if (service.isAsync(opt.id)) continue;
        const result = service.apply(opt.id, sample);
        expect(result.ok).toBe(true);
      }
    });

    it('apply returns error for json-format on invalid JSON', () => {
      const result = service.apply('json-format', 'not json');
      expect(result).toMatchObject({ ok: false, error: 'TRANSFORM.ERROR_JSON' });
    });

    it('apply returns error for url-decode on invalid encoding', () => {
      const result = service.apply('url-decode', '%invalid');
      expect(result).toMatchObject({ ok: false, error: 'TRANSFORM.ERROR_URL_DECODE' });
    });

    it('apply clears error on second call if first was invalid json then valid json', () => {
      const invalid = service.apply('json-format', 'not json');
      expect(invalid.ok).toBe(false);
      const valid = service.apply('json-format', '{"a":1}');
      expect(valid.ok).toBe(true);
      if (valid.ok) expect(valid.value).toBe('{\n  "a": 1\n}');
    });

    it('applyAsync returns ok for all hash transforms on a sample string', async () => {
      const sample = 'hello world';
      for (const opt of service.options) {
        if (!service.isAsync(opt.id)) continue;
        const result = await service.applyAsync(opt.id, sample);
        expect(result.ok).toBe(true);
      }
    });

    it('apply returns error for base64-decode on garbage input', () => {
      const result = service.apply('base64-decode', '!!!not-base64!!!');
      expect(result).toMatchObject({ ok: false, error: 'TRANSFORM.ERROR_BASE64_DECODE' });
    });
  });
});
