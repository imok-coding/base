import { useState } from "react";

/** Keep the last non-null value so sheets can animate out with their content. */
export function useSticky(value) {
  const [kept, setKept] = useState(value);
  if (value != null && value !== kept) setKept(value);
  return value ?? kept;
}
