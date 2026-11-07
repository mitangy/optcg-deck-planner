import { lazy, Suspense, type ComponentProps } from "react";
import { AuthLoadingSkeleton, GroupBuyDetailSkeleton, GroupBuysListSkeleton } from "./Skeleton";

/**
 * Route pages whose code lives in its own module, loaded on first visit instead of
 * with the entry bundle. Each fallback is the skeleton the page itself shows while its
 * data loads, so the hand-off from "code loading" to "data loading" does not move anything.
 * Pages that are pre-rendered or shown to signed-out visitors on first paint (landing,
 * legal, /meta, /cards/:id) stay eager.
 */
const GroupBuysPageImpl = lazy(() => import("./GroupBuys").then((m) => ({ default: m.GroupBuysPage })));
const GroupBuyDetailPageImpl = lazy(() => import("./GroupBuys").then((m) => ({ default: m.GroupBuyDetailPage })));
const GroupBuyJoinPageImpl = lazy(() => import("./GroupBuys").then((m) => ({ default: m.GroupBuyJoinPage })));
const PublicGroupBuyPageImpl = lazy(() => import("./GroupBuys").then((m) => ({ default: m.PublicGroupBuyPage })));
const FriendsPageImpl = lazy(() => import("./friends/FriendsPage").then((m) => ({ default: m.FriendsPage })));
const FriendPageImpl = lazy(() => import("./friends/FriendPage").then((m) => ({ default: m.FriendPage })));
const FriendDeckPageImpl = lazy(() => import("./friends/FriendDeckPage").then((m) => ({ default: m.FriendDeckPage })));
const CardScannerImpl = lazy(() => import("./CardScanner").then((m) => ({ default: m.CardScanner })));
const ScanValidatePageImpl = lazy(() => import("./devtools/ScanValidatePage"));

export function GroupBuysPage() {
  return (
    <Suspense fallback={<GroupBuysListSkeleton />}>
      <GroupBuysPageImpl />
    </Suspense>
  );
}

export function GroupBuyDetailPage() {
  return (
    <Suspense fallback={<GroupBuyDetailSkeleton />}>
      <GroupBuyDetailPageImpl />
    </Suspense>
  );
}

export function GroupBuyJoinPage() {
  return (
    <Suspense fallback={<AuthLoadingSkeleton label="Loading invite…" />}>
      <GroupBuyJoinPageImpl />
    </Suspense>
  );
}

export function PublicGroupBuyPage() {
  return (
    <Suspense fallback={<AuthLoadingSkeleton label="Loading…" />}>
      <PublicGroupBuyPageImpl />
    </Suspense>
  );
}

export function FriendsPage() {
  return (
    <Suspense fallback={<AuthLoadingSkeleton label="Loading…" />}>
      <FriendsPageImpl />
    </Suspense>
  );
}

export function FriendPage() {
  return (
    <Suspense fallback={<AuthLoadingSkeleton label="Loading…" />}>
      <FriendPageImpl />
    </Suspense>
  );
}

export function FriendDeckPage() {
  return (
    <Suspense fallback={<AuthLoadingSkeleton label="Loading…" />}>
      <FriendDeckPageImpl />
    </Suspense>
  );
}

/**
 * The card scanner dialog and everything behind it (OpenCV, the ONNX models, the camera UI). It opens
 * as a fixed overlay, so there is nothing to reserve space for while its code downloads.
 */
export function CardScanner(props: ComponentProps<typeof CardScannerImpl>) {
  return (
    <Suspense fallback={null}>
      <CardScannerImpl {...props} />
    </Suspense>
  );
}

/** Dev-only tool; `lazy` keeps it out of the production entry bundle for certain. */
export function ScanValidatePage() {
  return (
    <Suspense fallback={null}>
      <ScanValidatePageImpl />
    </Suspense>
  );
}
