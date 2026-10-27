/** Shared state of the on-screen joystick (touch devices): x = turn, y = walk (up is negative). */
export const JOY = { x: 0, y: 0, active: false };

/** True on phones/tablets (coarse pointer, no hover). Evaluated in the browser only. */
export const isTouchDevice = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
