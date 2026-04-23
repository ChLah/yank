// @vitest-environment jsdom
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    service = new ThemeService();
    document.documentElement.classList.remove('dark', 'light');
  });

  it('adds .dark class for dark theme', () => {
    service.applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('adds .light class for light theme', () => {
    service.applyTheme('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('removes both classes for system theme', () => {
    document.documentElement.classList.add('dark');
    service.applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('switches from light to dark', () => {
    service.applyTheme('light');
    service.applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });
});
