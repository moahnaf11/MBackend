import { FraudFlagStatus } from "../../../generated/prisma/enums";

// Defines which transitions are valid from each status
export const FRAUD_FLAG_TRANSITIONS: Record<FraudFlagStatus, FraudFlagStatus[]> = {
  [FraudFlagStatus.OPEN]: [
    FraudFlagStatus.REVIEWING,
    FraudFlagStatus.RESOLVED,
    FraudFlagStatus.DISMISSED,
  ],
  [FraudFlagStatus.REVIEWING]: [FraudFlagStatus.RESOLVED, FraudFlagStatus.DISMISSED],
  [FraudFlagStatus.RESOLVED]: [],
  [FraudFlagStatus.DISMISSED]: [],
};
