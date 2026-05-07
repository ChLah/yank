import { Pipe, PipeTransform } from '@angular/core';
import { formatBytes } from '../utils/format-bytes';

@Pipe({ name: 'formatBytes' })
export class FormatBytesPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return '';
    return formatBytes(value);
  }
}
