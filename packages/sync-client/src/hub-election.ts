// Hub election (01-F13; 24-F8 artifact HUB-ELECTION.md): a pure function of the
// visible peer set — every device computes the same winner locally, no consensus
// rounds. Rank = index in HUB_ELIGIBLE_CLASSES (hub-priority order, lower wins);
// tie → lexicographically lowest device_id; classes outside the eligible set never
// win (01-F39); null when nothing eligible is visible. Permutation-invariant by
// construction: the winner is the (rank, device_id)-minimal eligible peer.
import { type DeviceClass, HUB_ELIGIBLE_CLASSES } from "@restos/domain";
import type { PeerInfo } from "@restos/sync-protocol";

const rankOf = (device_class: DeviceClass): number =>
  (HUB_ELIGIBLE_CLASSES as readonly DeviceClass[]).indexOf(device_class);

export const electHub = (peers: readonly PeerInfo[]): string | null => {
  let winner: { rank: number; device_id: string } | null = null;
  for (const peer of peers) {
    const rank = rankOf(peer.device_class);
    if (rank < 0) continue;
    if (
      winner === null ||
      rank < winner.rank ||
      (rank === winner.rank && peer.device_id < winner.device_id)
    ) {
      winner = { rank, device_id: peer.device_id };
    }
  }
  return winner === null ? null : winner.device_id;
};
