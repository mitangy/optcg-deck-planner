import { useCopyFlash } from "../../board/match/RoomShare";

export function CopyJoinLink({ url }: { url: string }) {
  const { copied, copy } = useCopyFlash();
  return (
    <button type="button" className="btn btn-primary" onClick={() => void copy(url, "link")}>
      {copied === "link" ? "Link copied ✓" : copied === "failed" ? "Couldn't copy" : "Copy invite link"}
    </button>
  );
}
