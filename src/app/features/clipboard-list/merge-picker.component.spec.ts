import { MergePickerComponent, MERGE_OPTIONS } from './merge-picker.component';

describe('MergePickerComponent', () => {
  it('is defined', () => {
    expect(MergePickerComponent).toBeDefined();
  });

  it('exposes three options in fixed order: newline, bullet, comma', () => {
    expect(MERGE_OPTIONS.map((o) => o.id)).toEqual(['newline', 'bullet', 'comma']);
  });

  it('every option has an i18n labelKey under MERGE.*', () => {
    for (const opt of MERGE_OPTIONS) {
      expect(opt.labelKey.startsWith('MERGE.')).toBe(true);
    }
  });
});
