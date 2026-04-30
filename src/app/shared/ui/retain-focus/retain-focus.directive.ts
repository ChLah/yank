import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/**
 * Reclaims focus to this element whenever focus escapes to document.body.
 *
 * When a focused descendant is removed from the DOM the browser silently moves
 * focus to document.body without dispatching focusin on body — but it does
 * dispatch focusout on the element that lost focus, which bubbles up to every
 * ancestor. We schedule a microtask so the DOM settles first, then check
 * whether body is still the active element before reclaiming.
 *
 * Hierarchy: when multiple elements in the same subtree carry this directive,
 * the innermost always wins. focusout bubbles synchronously, so the innermost
 * handler fires first and its microtask is queued first. Microtasks run FIFO:
 * the innermost microtask reclaims focus, and by the time the outer microtask
 * runs document.activeElement is no longer body — so the outer does nothing.
 */
@Directive({
  selector: '[appRetainFocus]',
})
export class RetainFocusDirective {
  private readonly el = inject(ElementRef<HTMLElement>);

  @HostListener('focusout', ['$event'])
  protected onFocusOut(event: FocusEvent): void {
    if (event.relatedTarget !== null) return;
    queueMicrotask(() => {
      if (document.activeElement === document.body) {
        this.el.nativeElement.focus();
      }
    });
  }
}
