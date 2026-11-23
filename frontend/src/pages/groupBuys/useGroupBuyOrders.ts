import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type GroupBuyDetail, type GroupBuyOrder } from "../../api";
import { ApiError } from "../../apiClient";
import { qk } from "../../cache/queryKeys";
import { invalidateOwnedViews } from "../collection/ownedCollection";
import { arrivalPayload } from "./groupBuyOrders";

/** Mark arrived, Check items, Undo, Delete and Close. Arrivals change Owned on the server, so those views refetch. */
export function useGroupBuyOrders(groupId: number, onMessage: (message: string | null) => void) {
  const qc = useQueryClient();

  const accept = async (d: GroupBuyDetail, alsoOwned: boolean) => {
    qc.setQueryData(qk.groupBuy.detail(groupId), d);
    await qc.invalidateQueries({ queryKey: qk.groupBuys() });
    if (alsoOwned) invalidateOwnedViews(qc);
  };

  // Someone else changed the order since this page loaded (409): show the server's words and reload.
  const fail = (e: Error) => {
    onMessage(e.message);
    if (e instanceof ApiError && e.status === 409) void qc.invalidateQueries({ queryKey: qk.groupBuy.detail(groupId) });
  };

  const markArrived = useMutation({
    mutationFn: (order: GroupBuyOrder) =>
      api.setGroupBuyOrderArrival(groupId, order.id, { expected_version: order.version, all: true }),
    onSuccess: async (d) => {
      await accept(d, true);
      onMessage(null);
    },
    onError: fail,
  });

  const saveArrival = useMutation({
    mutationFn: ({ order, draft }: { order: GroupBuyOrder; draft: Record<number, number> }) =>
      api.setGroupBuyOrderArrival(groupId, order.id, arrivalPayload(order, draft)),
    onSuccess: async (d) => {
      await accept(d, true);
      onMessage(null);
    },
    onError: fail,
  });

  const undoArrival = useMutation({
    mutationFn: (order: GroupBuyOrder) => api.undoGroupBuyOrderArrival(groupId, order.id, order.version),
    onSuccess: async (d) => {
      await accept(d, true);
      onMessage("Arrival undone. Those copies are off members' Owned again.");
    },
    onError: fail,
  });

  const deleteOrder = useMutation({
    mutationFn: (order: GroupBuyOrder) => api.deleteGroupBuyOrder(groupId, order.id),
    onSuccess: async (d) => {
      await accept(d, false);
      onMessage("Order deleted. Its copies are not in an order yet.");
    },
    onError: fail,
  });

  const close = useMutation({
    mutationFn: () => api.closeGroupBuy(groupId),
    onSuccess: async (d) => {
      await accept(d, false);
      onMessage("Group buy closed. Copies that were never ordered stay on members' Shopping lists.");
    },
    onError: fail,
  });

  return {
    markArrived,
    saveArrival,
    undoArrival,
    deleteOrder,
    close,
    busy: markArrived.isPending || saveArrival.isPending || undoArrival.isPending || deleteOrder.isPending || close.isPending,
    accept,
  };
}
