import { DesignRequirement } from "../types";
import { FIELD_NAMES } from "../lib/constants";

type BitableApi = {
  base?: {
    getActiveTable?: () => Promise<unknown>;
  };
};

declare global {
  interface Window {
    bitable?: BitableApi;
  }
}

export async function upsertRequirementsToBitable(requirements: DesignRequirement[]): Promise<void> {
  if (!window.bitable?.base?.getActiveTable) {
    console.info("Bitable SDK unavailable; running in local preview mode.", {
      fieldMap: FIELD_NAMES,
      requirements
    });
    return;
  }

  // The local preview intentionally avoids guessing SDK method names across versions.
  // In Feishu, wire this function to the active table's record create/update APIs.
  console.info("Ready to upsert requirements into the active Bitable table.", {
    fieldMap: FIELD_NAMES,
    requirements
  });
}
