import { cx } from "../classNames";
import { BUILD_SHA } from "./buildInfo";

type Props = {
  className?: string;
};

export function BuildTag({ className }: Props) {
  return (
    <span className={cx("build-tag", className)} title={`Build ${BUILD_SHA}`} aria-label={`Build ${BUILD_SHA}`}>
      {BUILD_SHA}
    </span>
  );
}
