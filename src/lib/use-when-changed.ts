import { useState } from "react";

/**
 * Runs `onChange` during render the moment `value` differs from the previous render, so state that follows a prop is
 * already correct on the first paint (an effect would paint the stale value first). `onChange` may set this component's
 * own state. Comparison is by `Object.is`, so pass a primitive or a stable reference.
 */
export function useWhenChanged<T>(value: T, onChange: (next: T, previous: T) => void) {
  const [previous, setPrevious] = useState(value);
  if (!Object.is(previous, value)) {
    setPrevious(value);
    onChange(value, previous);
  }
}
