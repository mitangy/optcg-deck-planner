import { BUILD_SHA } from "./buildInfo";

type Props = {
  /** Extra class names (e.g. login placement). */
  className?: string;
};

/** Discreet build identifier so we can tell which commit a deploy is running. */
export function BuildTag({ className }: Props) {
  const classes = className ? `build-tag ${className}` : "build-tag";
  return (
    <span className={classes} title={`Build ${BUILD_SHA}`} aria-label={`Build ${BUILD_SHA}`}>
      {BUILD_SHA}
    </span>
  );
}
