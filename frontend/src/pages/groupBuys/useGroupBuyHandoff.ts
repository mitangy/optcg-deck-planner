import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type GroupBuyDetail, type GroupBuyHandoffUpdate } from "../../api";
import { qk } from "../../cache/queryKeys";

/** Host sets one member's hand-off; a member confirms their own. The server answers with the whole detail. */
export function useGroupBuyHandoff(groupId: number, onMessage: (message: string | null) => void) {
  const qc = useQueryClient();
  const accept = async (d: GroupBuyDetail) => {
    qc.setQueryData(qk.groupBuy.detail(groupId), d);
    await qc.invalidateQueries({ queryKey: qk.groupBuys() });
    onMessage(null);
  };

  const setHandoff = useMutation({
    mutationFn: ({ userId, body }: { userId: number; body: GroupBuyHandoffUpdate }) =>
      api.setGroupBuyHandoff(groupId, userId, body),
    onSuccess: accept,
    onError: (e: Error) => onMessage(e.message),
  });

  const confirmReceived = useMutation({
    mutationFn: () => api.confirmGroupBuyHandoffReceived(groupId),
    onSuccess: accept,
    onError: (e: Error) => onMessage(e.message),
  });

  return { setHandoff, confirmReceived, busy: setHandoff.isPending || confirmReceived.isPending };
}
