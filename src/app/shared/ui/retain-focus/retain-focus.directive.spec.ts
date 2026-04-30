// @vitest-environment jsdom
import { Component } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { RetainFocusDirective } from './retain-focus.directive';

beforeAll(() => {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

const flushMicrotasks = (): Promise<void> => new Promise(resolve => queueMicrotask(resolve));

@Component({
  template: `<div appRetainFocus tabindex="-1" id="host"><button id="child">child</button></div>`,
  imports: [RetainFocusDirective],
})
class SingleDirectiveComponent {}

describe('RetainFocusDirective', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('reclaims focus to host when a focused child is removed from the DOM', async () => {
    TestBed.configureTestingModule({ imports: [SingleDirectiveComponent] });
    const fixture = TestBed.createComponent(SingleDirectiveComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('[appRetainFocus]') as HTMLElement;
    const child = fixture.nativeElement.querySelector('#child') as HTMLElement;

    child.focus();
    expect(document.activeElement).toBe(child);

    // jsdom fires blur but not focusout on DOM removal; dispatch manually.
    // In a real browser the browser fires focusout (bubbling) before moving
    // activeElement to body, so this matches the real event sequence.
    child.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null, bubbles: true }));
    child.remove(); // jsdom now sets document.activeElement to body

    await flushMicrotasks();

    expect(document.activeElement).toBe(host);
  });

  it('does not reclaim focus when focus moves to another focusable element', async () => {
    TestBed.configureTestingModule({ imports: [SingleDirectiveComponent] });
    const fixture = TestBed.createComponent(SingleDirectiveComponent);
    fixture.detectChanges();
    const child = fixture.nativeElement.querySelector('#child') as HTMLElement;

    const other = document.createElement('button');
    document.body.appendChild(other);
    child.focus();
    other.focus();

    await flushMicrotasks();

    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('does not reclaim focus when document.activeElement is not body', async () => {
    TestBed.configureTestingModule({ imports: [SingleDirectiveComponent] });
    const fixture = TestBed.createComponent(SingleDirectiveComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('[appRetainFocus]') as HTMLElement;

    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();

    // Dispatch focusout with relatedTarget=null while another element is already focused
    host.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null, bubbles: true }));
    await flushMicrotasks();

    // host should NOT steal focus from `other`
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('innermost directive reclaims focus — outer does not override it', async () => {
    @Component({
      template: `
        <div appRetainFocus tabindex="-1" id="outer">
          <div appRetainFocus tabindex="-1" id="inner">
            <button id="btn">btn</button>
          </div>
        </div>
      `,
      imports: [RetainFocusDirective],
    })
    class NestedComponent {}

    TestBed.configureTestingModule({ imports: [NestedComponent] });
    const fixture = TestBed.createComponent(NestedComponent);
    fixture.detectChanges();
    const inner = fixture.nativeElement.querySelector('#inner') as HTMLElement;
    const btn = fixture.nativeElement.querySelector('#btn') as HTMLElement;

    btn.focus();
    // jsdom fires blur but not focusout on DOM removal; dispatch manually.
    // The button is still in the DOM when the event fires, so it bubbles
    // through inner then outer — matching real browser event order.
    btn.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null, bubbles: true }));
    btn.remove(); // jsdom now sets document.activeElement to body

    // Two microtasks are queued (inner first, outer second).
    // Inner runs first → focus goes to inner. Outer runs → body not active → no-op.
    await flushMicrotasks();

    expect(document.activeElement).toBe(inner);
  });
});
