import { Fragment, type ReactNode } from "react";

/** Card name with a soft line-break opportunity after each ".", so long dotted
 * names ("Monkey.D.Luffy") can wrap in a narrow cell. `<wbr>` adds no characters,
 * so the visible and copied text stay identical. */
export function nameWithBreaks(name: string): ReactNode {
  const parts = name.split(".");
  if (parts.length === 1) return name;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i < parts.length - 1 ? `${part}.` : part}
      {i < parts.length - 1 && <wbr />}
    </Fragment>
  ));
}
