import { appClient } from "@/clients";
import type { FleetDeckEdge } from "@/store/fleetDeckStore";

export const fleetDeckController = {
  persistOpen: (isOpen: boolean): Promise<void> =>
    appClient.setState({ fleetDeckOpen: isOpen }).catch((error) => {
      console.error("Failed to persist fleet deck open state:", error);
    }),

  persistEdge: (edge: FleetDeckEdge): Promise<void> =>
    appClient.setState({ fleetDeckEdge: edge }).catch((error) => {
      console.error("Failed to persist fleet deck edge:", error);
    }),

  persistWidth: (width: number): Promise<void> =>
    appClient.setState({ fleetDeckWidth: width }).catch((error) => {
      console.error("Failed to persist fleet deck width:", error);
    }),

  persistHeight: (height: number): Promise<void> =>
    appClient.setState({ fleetDeckHeight: height }).catch((error) => {
      console.error("Failed to persist fleet deck height:", error);
    }),

  persistAlwaysPreview: (value: boolean): Promise<void> =>
    appClient.setState({ fleetDeckAlwaysPreview: value }).catch((error) => {
      console.error("Failed to persist fleet deck alwaysPreview:", error);
    }),

  persistQuorumThreshold: (value: number): Promise<void> =>
    appClient.setState({ fleetDeckQuorumThreshold: value }).catch((error) => {
      console.error("Failed to persist fleet deck quorumThreshold:", error);
    }),
};
