import { cx } from "../classNames";
import { BUILD_SHA } from "./buildInfo";

type Props = {
  /** Extra class names (e.g. login or lobby placement). */
  className?: string;
};

/** Discreet build identifier so we can tell which commit a deploy is running. */
export function BuildTag({ className }: Props) {
  return (
    <span className={cx("build-tag", className)} title={`Build ${BUILD_SHA}`} aria-label={`Build ${BUILD_SHA}`}>
      {BUILD_SHA}
    </span>
  );
}
