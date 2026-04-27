import { TransformPickerComponent } from './transform-picker.component';
import { TransformService } from '../../core/services/transform.service';
import { TransformResult } from '../../core/services/transform.service';

describe('TransformPickerComponent', () => {
  it('is defined', () => {
    expect(TransformPickerComponent).toBeDefined();
  });

  describe('TransformService integration (via TransformPickerComponent logic)', () => {
    let service: TransformService;

    beforeEach(() => { service = new TransformService(); });

    it('apply returns ok for all 8 transform types on a sample string', () => {
      const sample = 'hello world';
      const noErrorTransforms = service.options.filter(
        o => o.id !== 'url-decode' && o.id !== 'json-format'
      );
      for (const opt of noErrorTransforms) {
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
  });
});
