/** True when a gesture belongs to a control rather than the aquarium canvas. */
export function isUIEvent(event: Event): boolean {
  return event.composedPath().some(node => node instanceof Element &&
    !!node.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="dialog"],.radar,.search,.detail'));
}
