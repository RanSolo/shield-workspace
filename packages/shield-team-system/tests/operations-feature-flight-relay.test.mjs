import assert from "node:assert/strict";
import test from "node:test";

import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
  replaySeatDispatchReceiptsV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";
import {
  FEATURE_FLIGHT_RELAY_ACKNOWLEDGED_CONTRACT_VERSION,
  FEATURE_FLIGHT_RELAY_ACKNOWLEDGED_NEXT_ACTION,
  FEATURE_FLIGHT_RELAY_ACKNOWLEDGEMENT_NOTICE,
  FEATURE_FLIGHT_RELAY_ACKNOWLEDGEMENT_RESULT_CODES,
  FEATURE_FLIGHT_RELAY_CONTRACT_VERSION,
  FEATURE_FLIGHT_RELAY_DELIVERED_CONTRACT_VERSION,
  FEATURE_FLIGHT_RELAY_DELIVERED_NEXT_ACTION,
  FEATURE_FLIGHT_RELAY_DELIVERY_RECEIPT_CONTRACT_VERSION,
  FEATURE_FLIGHT_RELAY_DELIVERY_RESULT_CODES,
  FEATURE_FLIGHT_RELAY_MAX_BYTES,
  FEATURE_FLIGHT_RELAY_NEXT_ACTION,
  FEATURE_FLIGHT_RELAY_REQUESTED_OBSERVATION,
  canonicalFeatureFlightRelayBytesV1,
  createFeatureFlightRelayAcknowledgedEntryV1,
  createFeatureFlightRelayAcknowledgementV1,
  createFeatureFlightRelayDeliveredEntryV1,
  createFeatureFlightRelayDeliveryReceiptV1,
  createFeatureFlightRelayEntryV1,
  createFeatureFlightRelayFromSeatDispatchV1,
  createFeatureFlightRelayV1,
  featureFlightRelayDigestV1,
  inspectFeatureFlightRelaysV1,
  reconcileFeatureFlightRelayAcknowledgementV1,
  reconcileFeatureFlightRelayDeliveryV1,
  reconcileFeatureFlightRelayEntryV1,
  replayFeatureFlightRelayLedgerV1,
  validateFeatureFlightRelayEntryV1,
  validateFeatureFlightRelayDeliveryReceiptV1,
  validateFeatureFlightRelayAcknowledgementV1,
  validateFeatureFlightRelayV1,
} from "../scripts/operations/feature-flight-relay.mjs";

const REVISION = "4".repeat(40);
const SLICE_1_PENDING_RELAY_BYTES = Buffer.from(
  "eyJhcnRpZmFjdFR5cGUiOiJmZWF0dXJlLWZsaWdodC1yZWxheSIsImF1dGhvcml0eSI6Im5vbmUiLCJjb250cmFjdFZlcnNpb24iOiJzaGllbGQuZmVhdHVyZS1mbGlnaHQtcmVsYXkucGVuZGluZy52MSIsImtpbmQiOiJyZWxheS5wZW5kaW5nIiwibm90aWNlIjoiQWR2aXNvcnkgd2FrZS11cCByZWZlcmVuY2Ugb25seS4gVGhpcyByZWxheSBncmFudHMgbm8gYXV0aG9yaXR5LCBwZXJtaXNzaW9uLCByZXZpZXcsIGFjY2VwdGFuY2UsIGRlbGl2ZXJ5LCBvciBleGVjdXRpb24uIiwicmVjaXBpZW50Ijp7ImNvbnRyb2xsZXJJZGVudGl0eSI6ImNvbnRyb2xsZXI6aGlsbDppc3N1ZS0yNDgiLCJsYW5lSWQiOiJsYW5lOmlzc3VlLTI0OCIsInNlYXRJZCI6ImhpbGwifSwicmVsYXlEaWdlc3QiOiJzaGEyNTY6RXRHeHBubFkzTEVaeXFqRnlCdmtpNGl3M2NSNC1sMnkwZlBBUG5kY0xOOCIsInJlbGF5SWQiOiJyZWxheTpFdEd4cG5sWTNMRVp5cWpGeUJ2a2k0aXczY1I0LWwyeTBmUEFQbmRjTE44IiwicmVxdWVzdGVkT2JzZXJ2YXRpb24iOiJvYnNlcnZlX3Rlcm1pbmFsX2Rpc3BhdGNoIiwic2NoZW1hVmVyc2lvbiI6MSwic291cmNlIjp7ImFydGlmYWN0SWQiOiJhcnRpZmFjdDppc3N1ZS0yNDgtc2xpY2UtMSIsImFydGlmYWN0UmV2aXNpb24iOiI0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0IiwiY2hpbGRTZXNzaW9uSWQiOiJzZXNzaW9uOjI0ODptYXkiLCJjaGlsZFRhc2tJZCI6InRhc2s6MjQ4Om1heSIsImRpc3BhdGNoSWQiOiJkaXNwYXRjaDoyNDg6MSIsInBhcmVudE1pc3Npb25JZCI6Im1pc3Npb246aXNzdWUtMjQ4LXNsaWNlLTEiLCJwYXJlbnRNaXNzaW9uUmV2aXNpb24iOiI0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0IiwicGFyZW50U2Vzc2lvbklkIjoic2Vzc2lvbjoyNDg6cGFyZW50IiwicmVjZWlwdElkIjoicmVjZWlwdDoyNDg6MSIsInJlcG9zaXRvcnlJZCI6InJlcG86c2hpZWxkLXdvcmtzcGFjZSIsInJlcG9zaXRvcnlSZXZpc2lvbiI6IjQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQiLCJyZXBvc2l0b3J5V29ya3NwYWNlSWQiOiJ3b3Jrc3BhY2U6aXNzdWUtMjQ4Iiwic291cmNlQWNjb3VudGFibGVTZWF0SWQiOiJtYXkiLCJzdWJqZWN0SWQiOiJpc3N1ZToyNDgiLCJzdWJqZWN0UmV2aXNpb24iOiI0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0In0sInRlcm1pbmFsIjp7ImVudHJ5RGlnZXN0Ijoic2hhMjU2Oi0tc3BhWmF1bHJ2YzlaQVk3bnZzM01FdWJHNmM5ZWR3aGRRY2dFaFd3LVUiLCJraW5kIjoiZGlzcGF0Y2guY29tcGxldGVkIiwibGlmZWN5Y2xlU2VxdWVuY2UiOjEsImxvZ1NlcXVlbmNlIjoxfX0=",
  "base64",
);
const SLICE_1_PENDING_ENTRY_BYTES = Buffer.from(
  "eyJhcnRpZmFjdFR5cGUiOiJmZWF0dXJlLWZsaWdodC1yZWxheS1lbnRyeSIsImF1dGhvcml0eSI6Im5vbmUiLCJjb250cmFjdFZlcnNpb24iOiJzaGllbGQuZmVhdHVyZS1mbGlnaHQtcmVsYXkucGVuZGluZy52MSIsImVudHJ5RGlnZXN0Ijoic2hhMjU2Olh4bGRSLWM4TWI2QnV2aGUtR190c0lkbm0xdi1tWUR4bHZ0blpna0lMcFEiLCJlbnRyeUlkIjoicmVsYXktZW50cnk6RXRHeHBubFkzTEVaeXFqRnlCdmtpNGl3M2NSNC1sMnkwZlBBUG5kY0xOODowIiwia2luZCI6InJlbGF5LnBlbmRpbmciLCJsaWZlY3ljbGVTZXF1ZW5jZSI6MCwibG9nU2VxdWVuY2UiOjAsIm5vdGljZSI6IkFkdmlzb3J5IHdha2UtdXAgcmVmZXJlbmNlIG9ubHkuIFRoaXMgcmVsYXkgZ3JhbnRzIG5vIGF1dGhvcml0eSwgcGVybWlzc2lvbiwgcmV2aWV3LCBhY2NlcHRhbmNlLCBkZWxpdmVyeSwgb3IgZXhlY3V0aW9uLiIsInByZXZpb3VzTGlmZWN5Y2xlRGlnZXN0IjpudWxsLCJwcmV2aW91c0xvZ0RpZ2VzdCI6bnVsbCwicmVsYXkiOnsiYXJ0aWZhY3RUeXBlIjoiZmVhdHVyZS1mbGlnaHQtcmVsYXkiLCJhdXRob3JpdHkiOiJub25lIiwiY29udHJhY3RWZXJzaW9uIjoic2hpZWxkLmZlYXR1cmUtZmxpZ2h0LXJlbGF5LnBlbmRpbmcudjEiLCJraW5kIjoicmVsYXkucGVuZGluZyIsIm5vdGljZSI6IkFkdmlzb3J5IHdha2UtdXAgcmVmZXJlbmNlIG9ubHkuIFRoaXMgcmVsYXkgZ3JhbnRzIG5vIGF1dGhvcml0eSwgcGVybWlzc2lvbiwgcmV2aWV3LCBhY2NlcHRhbmNlLCBkZWxpdmVyeSwgb3IgZXhlY3V0aW9uLiIsInJlY2lwaWVudCI6eyJjb250cm9sbGVySWRlbnRpdHkiOiJjb250cm9sbGVyOmhpbGw6aXNzdWUtMjQ4IiwibGFuZUlkIjoibGFuZTppc3N1ZS0yNDgiLCJzZWF0SWQiOiJoaWxsIn0sInJlbGF5RGlnZXN0Ijoic2hhMjU2OkV0R3hwbmxZM0xFWnlxakZ5QnZraTRpdzNjUjQtbDJ5MGZQQVBuZGNMTjgiLCJyZWxheUlkIjoicmVsYXk6RXRHeHBubFkzTEVaeXFqRnlCdmtpNGl3M2NSNC1sMnkwZlBBUG5kY0xOOCIsInJlcXVlc3RlZE9ic2VydmF0aW9uIjoib2JzZXJ2ZV90ZXJtaW5hbF9kaXNwYXRjaCIsInNjaGVtYVZlcnNpb24iOjEsInNvdXJjZSI6eyJhcnRpZmFjdElkIjoiYXJ0aWZhY3Q6aXNzdWUtMjQ4LXNsaWNlLTEiLCJhcnRpZmFjdFJldmlzaW9uIjoiNDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NCIsImNoaWxkU2Vzc2lvbklkIjoic2Vzc2lvbjoyNDg6bWF5IiwiY2hpbGRUYXNrSWQiOiJ0YXNrOjI0ODptYXkiLCJkaXNwYXRjaElkIjoiZGlzcGF0Y2g6MjQ4OjEiLCJwYXJlbnRNaXNzaW9uSWQiOiJtaXNzaW9uOmlzc3VlLTI0OC1zbGljZS0xIiwicGFyZW50TWlzc2lvblJldmlzaW9uIjoiNDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NCIsInBhcmVudFNlc3Npb25JZCI6InNlc3Npb246MjQ4OnBhcmVudCIsInJlY2VpcHRJZCI6InJlY2VpcHQ6MjQ4OjEiLCJyZXBvc2l0b3J5SWQiOiJyZXBvOnNoaWVsZC13b3Jrc3BhY2UiLCJyZXBvc2l0b3J5UmV2aXNpb24iOiI0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0IiwicmVwb3NpdG9yeVdvcmtzcGFjZUlkIjoid29ya3NwYWNlOmlzc3VlLTI0OCIsInNvdXJjZUFjY291bnRhYmxlU2VhdElkIjoibWF5Iiwic3ViamVjdElkIjoiaXNzdWU6MjQ4Iiwic3ViamVjdFJldmlzaW9uIjoiNDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NCJ9LCJ0ZXJtaW5hbCI6eyJlbnRyeURpZ2VzdCI6InNoYTI1NjotLXNwYVphdWxydmM5WkFZN252czNNRXViRzZjOWVkd2hkUWNnRWhXdy1VIiwia2luZCI6ImRpc3BhdGNoLmNvbXBsZXRlZCIsImxpZmVjeWNsZVNlcXVlbmNlIjoxLCJsb2dTZXF1ZW5jZSI6MX19LCJyZWxheURpZ2VzdCI6InNoYTI1NjpFdEd4cG5sWTNMRVp5cWpGeUJ2a2k0aXczY1I0LWwyeTBmUEFQbmRjTE44IiwicmVsYXlJZCI6InJlbGF5OkV0R3hwbmxZM0xFWnlxakZ5QnZraTRpdzNjUjQtbDJ5MGZQQVBuZGNMTjgiLCJzY2hlbWFWZXJzaW9uIjoxfQ==",
  "base64",
);
const SLICE_2_DELIVERED_ENTRY_BYTES = Buffer.from(
  "eyJhcnRpZmFjdFR5cGUiOiJmZWF0dXJlLWZsaWdodC1yZWxheS1lbnRyeSIsImF1dGhvcml0eSI6Im5vbmUiLCJjb250cmFjdFZlcnNpb24iOiJzaGllbGQuZmVhdHVyZS1mbGlnaHQtcmVsYXkuZGVsaXZlcmVkLnYxIiwiZGVsaXZlcnlSZWNlaXB0Ijp7ImFydGlmYWN0VHlwZSI6ImZlYXR1cmUtZmxpZ2h0LXJlbGF5LWRlbGl2ZXJ5LXJlY2VpcHQiLCJhdXRob3JpdHkiOiJub25lIiwiY29udHJhY3RWZXJzaW9uIjoic2hpZWxkLmZlYXR1cmUtZmxpZ2h0LXJlbGF5LmRlbGl2ZXJ5LXJlY2VpcHQudjEiLCJkZWxpdmVyeUtleSI6InJlbGF5LWRlbGl2ZXJ5OmNLNHZ2Tm5JRHhsTDBtT3laSWVvc1E4S2xCcXN0MlRJbHoxdm1qbHVuYzAiLCJub3RpY2UiOiJMb2NhbCBkZWxpdmVyeSBldmlkZW5jZSBvbmx5LiBUaGlzIHJlY2VpcHQgZ3JhbnRzIG5vIGF1dGhvcml0eSwgcGVybWlzc2lvbiwgcmV2aWV3LCBhY2NlcHRhbmNlLCBhY2tub3dsZWRnZW1lbnQsIG9yIGV4ZWN1dGlvbi4iLCJyZWNlaXB0RGlnZXN0Ijoic2hhMjU2OnBmSTBDcWlxVEc1dFM0WVBFN3FWZGt2Ym5lcjA1MWk3RU5rQXZwa3RqX00iLCJyZWNpcGllbnQiOnsiY29udHJvbGxlcklkZW50aXR5IjoiY29udHJvbGxlcjpoaWxsOmlzc3VlLTI0OCIsImxhbmVJZCI6ImxhbmU6aXNzdWUtMjQ4Iiwic2VhdElkIjoiaGlsbCJ9LCJyZWxheURpZ2VzdCI6InNoYTI1NjpFdEd4cG5sWTNMRVp5cWpGeUJ2a2k0aXczY1I0LWwyeTBmUEFQbmRjTE44IiwicmVsYXlJZCI6InJlbGF5OkV0R3hwbmxZM0xFWnlxakZ5QnZraTRpdzNjUjQtbDJ5MGZQQVBuZGNMTjgiLCJyZXBvc2l0b3J5SWQiOiJyZXBvOnNoaWVsZC13b3Jrc3BhY2UiLCJyZXBvc2l0b3J5UmV2aXNpb24iOiI0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0IiwicmVwb3NpdG9yeVdvcmtzcGFjZUlkIjoid29ya3NwYWNlOmlzc3VlLTI0OCIsInNjaGVtYVZlcnNpb24iOjF9LCJlbnRyeURpZ2VzdCI6InNoYTI1NjpUd2wtcU9veFRGNW5tM1poMXJUZGg1QWF1Q2V3ZWFzTG55VWdjRlNaOURjIiwiZW50cnlJZCI6InJlbGF5LWVudHJ5OkV0R3hwbmxZM0xFWnlxakZ5QnZraTRpdzNjUjQtbDJ5MGZQQVBuZGNMTjg6MSIsImtpbmQiOiJyZWxheS5kZWxpdmVyZWQiLCJsaWZlY3ljbGVTZXF1ZW5jZSI6MSwibG9nU2VxdWVuY2UiOjEsIm5vdGljZSI6IkxvY2FsIGRlbGl2ZXJ5IGV2aWRlbmNlIG9ubHkuIFRoaXMgcmVjZWlwdCBncmFudHMgbm8gYXV0aG9yaXR5LCBwZXJtaXNzaW9uLCByZXZpZXcsIGFjY2VwdGFuY2UsIGFja25vd2xlZGdlbWVudCwgb3IgZXhlY3V0aW9uLiIsInByZXZpb3VzTGlmZWN5Y2xlRGlnZXN0Ijoic2hhMjU2Olh4bGRSLWM4TWI2QnV2aGUtR190c0lkbm0xdi1tWUR4bHZ0blpna0lMcFEiLCJwcmV2aW91c0xvZ0RpZ2VzdCI6InNoYTI1NjpYeGxkUi1jOE1iNkJ1dmhlLUdfdHNJZG5tMXYtbVlEeGx2dG5aZ2tJTHBRIiwicmVsYXkiOnsiYXJ0aWZhY3RUeXBlIjoiZmVhdHVyZS1mbGlnaHQtcmVsYXkiLCJhdXRob3JpdHkiOiJub25lIiwiY29udHJhY3RWZXJzaW9uIjoic2hpZWxkLmZlYXR1cmUtZmxpZ2h0LXJlbGF5LnBlbmRpbmcudjEiLCJraW5kIjoicmVsYXkucGVuZGluZyIsIm5vdGljZSI6IkFkdmlzb3J5IHdha2UtdXAgcmVmZXJlbmNlIG9ubHkuIFRoaXMgcmVsYXkgZ3JhbnRzIG5vIGF1dGhvcml0eSwgcGVybWlzc2lvbiwgcmV2aWV3LCBhY2NlcHRhbmNlLCBkZWxpdmVyeSwgb3IgZXhlY3V0aW9uLiIsInJlY2lwaWVudCI6eyJjb250cm9sbGVySWRlbnRpdHkiOiJjb250cm9sbGVyOmhpbGw6aXNzdWUtMjQ4IiwibGFuZUlkIjoibGFuZTppc3N1ZS0yNDgiLCJzZWF0SWQiOiJoaWxsIn0sInJlbGF5RGlnZXN0Ijoic2hhMjU2OkV0R3hwbmxZM0xFWnlxakZ5QnZraTRpdzNjUjQtbDJ5MGZQQVBuZGNMTjgiLCJyZWxheUlkIjoicmVsYXk6RXRHeHBubFkzTEVaeXFqRnlCdmtpNGl3M2NSNC1sMnkwZlBBUG5kY0xOOCIsInJlcXVlc3RlZE9ic2VydmF0aW9uIjoib2JzZXJ2ZV90ZXJtaW5hbF9kaXNwYXRjaCIsInNjaGVtYVZlcnNpb24iOjEsInNvdXJjZSI6eyJhcnRpZmFjdElkIjoiYXJ0aWZhY3Q6aXNzdWUtMjQ4LXNsaWNlLTEiLCJhcnRpZmFjdFJldmlzaW9uIjoiNDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NCIsImNoaWxkU2Vzc2lvbklkIjoic2Vzc2lvbjoyNDg6bWF5IiwiY2hpbGRUYXNrSWQiOiJ0YXNrOjI0ODptYXkiLCJkaXNwYXRjaElkIjoiZGlzcGF0Y2g6MjQ4OjEiLCJwYXJlbnRNaXNzaW9uSWQiOiJtaXNzaW9uOmlzc3VlLTI0OC1zbGljZS0xIiwicGFyZW50TWlzc2lvblJldmlzaW9uIjoiNDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NCIsInBhcmVudFNlc3Npb25JZCI6InNlc3Npb246MjQ4OnBhcmVudCIsInJlY2VpcHRJZCI6InJlY2VpcHQ6MjQ4OjEiLCJyZXBvc2l0b3J5SWQiOiJyZXBvOnNoaWVsZC13b3Jrc3BhY2UiLCJyZXBvc2l0b3J5UmV2aXNpb24iOiI0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0IiwicmVwb3NpdG9yeVdvcmtzcGFjZUlkIjoid29ya3NwYWNlOmlzc3VlLTI0OCIsInNvdXJjZUFjY291bnRhYmxlU2VhdElkIjoibWF5Iiwic3ViamVjdElkIjoiaXNzdWU6MjQ4Iiwic3ViamVjdFJldmlzaW9uIjoiNDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NCJ9LCJ0ZXJtaW5hbCI6eyJlbnRyeURpZ2VzdCI6InNoYTI1NjotLXNwYVphdWxydmM5WkFZN252czNNRXViRzZjOWVkd2hkUWNnRWhXdy1VIiwia2luZCI6ImRpc3BhdGNoLmNvbXBsZXRlZCIsImxpZmVjeWNsZVNlcXVlbmNlIjoxLCJsb2dTZXF1ZW5jZSI6MX19LCJyZWxheURpZ2VzdCI6InNoYTI1NjpFdEd4cG5sWTNMRVp5cWpGeUJ2a2k0aXczY1I0LWwyeTBmUEFQbmRjTE44IiwicmVsYXlJZCI6InJlbGF5OkV0R3hwbmxZM0xFWnlxakZ5QnZraTRpdzNjUjQtbDJ5MGZQQVBuZGNMTjgiLCJzY2hlbWFWZXJzaW9uIjoxfQ==",
  "base64",
);

function identity(overrides = {}) {
  return {
    receiptId: "receipt:248:1",
    dispatchId: "dispatch:248:1",
    parentMissionId: "mission:issue-248-slice-1",
    parentMissionRevision: REVISION,
    parentSessionId: "session:248:parent",
    childTaskId: "task:248:may",
    childSessionId: "session:248:may",
    accountableSeatId: "may",
    repositoryId: "repo:shield-workspace",
    repositoryWorkspaceId: "workspace:issue-248",
    repositoryRevision: REVISION,
    subjectId: "issue:248",
    subjectRevision: REVISION,
    artifactId: "artifact:issue-248-slice-1",
    artifactRevision: REVISION,
    configuredRuntime: { kind: "runtime.configured", runtimeId: "runtime:codex", model: "model:gpt-5" },
    requestedRuntime: { kind: "runtime.requested", runtimeId: "runtime:codex", model: "model:gpt-5" },
    toolExecution: { kind: "tool.execution.not_requested", reason: "not_requested" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: { kind: "runtime.host_observed.unavailable", reason: "unobserved" },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: { kind: "executor.host_observed.unavailable", reason: "not_observed" },
    ...overrides,
  };
}

function started(overrides = {}) {
  return createSeatDispatchStartedEventV1({
    ...identity(overrides),
    inputEvidenceRefs: ["evidence:wheels-up:248"],
    timestamp: "2026-08-20T12:00:00.000Z",
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  });
}

function lifecycle(previous, kind, overrides = {}) {
  const source = identity({
    receiptId: previous.receiptId,
    dispatchId: previous.dispatchId,
    parentMissionId: previous.parentMissionId,
    parentMissionRevision: previous.parentMissionRevision,
    parentSessionId: previous.parentSessionId,
    childTaskId: previous.childTaskId,
    childSessionId: previous.childSessionId,
    accountableSeatId: previous.accountableSeatId,
    repositoryId: previous.repositoryId,
    repositoryWorkspaceId: previous.repositoryWorkspaceId,
    repositoryRevision: previous.repositoryRevision,
    subjectId: previous.subjectId,
    subjectRevision: previous.subjectRevision,
    artifactId: previous.artifactId,
    artifactRevision: previous.artifactRevision,
    configuredRuntime: previous.configuredRuntime,
    requestedRuntime: previous.requestedRuntime,
    toolExecution: previous.toolExecution,
    runtimeSelfReport: previous.runtimeSelfReport,
    runtimeHostObserved: previous.runtimeHostObserved,
    executorSelfReport: previous.executorSelfReport,
    executorHostObserved: previous.executorHostObserved,
  });
  const event = {
    ...source,
    kind,
    timestamp: new Date(Date.parse(previous.timestamp) + 1000).toISOString(),
    logSequence: previous.logSequence + 1,
    previousLogDigest: previous.entryDigest,
    lifecycleSequence: previous.lifecycleSequence + 1,
    previousLifecycleDigest: previous.entryDigest,
    ...overrides,
  };
  if (["dispatch.completed", "dispatch.failed", "dispatch.cancelled"].includes(kind)) event.outputEvidenceRefs = ["evidence:terminal:248"];
  return createSeatDispatchLifecycleEventV1(event);
}

function creationInput(overrides = {}) {
  const source = identity();
  return {
    repositoryRoot: "/repository/issue-248",
    receiptId: source.receiptId,
    dispatchId: source.dispatchId,
    parentMissionId: source.parentMissionId,
    parentMissionRevision: source.parentMissionRevision,
    parentSessionId: source.parentSessionId,
    childTaskId: source.childTaskId,
    childSessionId: source.childSessionId,
    sourceAccountableSeatId: source.accountableSeatId,
    repositoryId: source.repositoryId,
    repositoryWorkspaceId: source.repositoryWorkspaceId,
    repositoryRevision: source.repositoryRevision,
    subjectId: source.subjectId,
    subjectRevision: source.subjectRevision,
    artifactId: source.artifactId,
    artifactRevision: source.artifactRevision,
    recipientSeatId: "hill",
    recipientLaneId: "lane:issue-248",
    recipientControllerIdentity: "controller:hill:issue-248",
    requestedObservation: FEATURE_FLIGHT_RELAY_REQUESTED_OBSERVATION,
    ...overrides,
  };
}

function dependencies(entries, replay = replaySeatDispatchReceiptsV1(entries)) {
  return {
    readSeatDispatchReceiptLedgerV1: async () => ({ state: "valid", value: { entries } }),
    replaySeatDispatchReceiptsV1: () => replay,
  };
}

async function relayFrom(kind = "dispatch.completed", inputOverrides = {}) {
  const start = started();
  const terminal = lifecycle(start, kind);
  const result = await createFeatureFlightRelayFromSeatDispatchV1(creationInput(inputOverrides), dependencies([start, terminal]));
  assert.equal(result.state, "valid", result.reasonCodes?.join(" "));
  return { relay: result.value, entries: [start, terminal] };
}

test("preserves the literal Slice 1 pending relay and genesis entry bytes from the planning base", () => {
  const entry = JSON.parse(SLICE_1_PENDING_ENTRY_BYTES.toString("utf8"));
  const relay = entry.relay;
  const relayBytes = Buffer.from(JSON.stringify(relay), "utf8");
  assert.deepEqual(canonicalFeatureFlightRelayBytesV1(relay), relayBytes);
  assert.deepEqual(canonicalFeatureFlightRelayBytesV1(entry), SLICE_1_PENDING_ENTRY_BYTES);
  assert.equal(relay.relayDigest, "sha256:EtGxpnlY3LEZyqjFyBvki4iw3cR4-l2y0fPAPndcLN8");
  assert.equal(entry.entryDigest, "sha256:XxldR-c8Mb6Buvhe-G_tsIdnm1v-mYDxlvtnZgkILpQ");
  assert.equal(validateFeatureFlightRelayV1(relay).state, "valid");
  assert.equal(validateFeatureFlightRelayEntryV1(entry).state, "valid");
  const replay = replayFeatureFlightRelayLedgerV1([entry]);
  assert.equal(replay.state, "valid");
  assert.equal(replay.inspection.pending[0].lastEntryDigest, entry.entryDigest);
  assert.equal(Object.hasOwn(replay.inspection, "delivered"), false);
});

test("derives a compact canonical authority-none relay from each exact terminal dispatch kind", async () => {
  const relays = [];
  for (const kind of ["dispatch.completed", "dispatch.failed", "dispatch.cancelled"]) {
    const { relay } = await relayFrom(kind);
    relays.push(relay);
    assert.equal(relay.kind, "relay.pending");
    assert.equal(relay.authority, "none");
    assert.equal(relay.contractVersion, FEATURE_FLIGHT_RELAY_CONTRACT_VERSION);
    assert.equal(relay.terminal.kind, kind);
    assert.equal(relay.source.sourceAccountableSeatId, "may");
    assert.equal(relay.recipient.seatId, "hill");
    assert.ok(canonicalFeatureFlightRelayBytesV1(relay).length <= FEATURE_FLIGHT_RELAY_MAX_BYTES);
    assert.equal(validateFeatureFlightRelayV1(relay).state, "valid");
  }
  assert.equal(new Set(relays.map((relay) => relay.relayId)).size, 3);
});

test("binds the exact ordered terminal/source/recipient tuple and remains byte stable", async () => {
  const { relay } = await relayFrom();
  const rebuilt = createFeatureFlightRelayV1({
    requestedObservation: relay.requestedObservation,
    recipient: { controllerIdentity: relay.recipient.controllerIdentity, laneId: relay.recipient.laneId, seatId: relay.recipient.seatId },
    terminal: { lifecycleSequence: relay.terminal.lifecycleSequence, logSequence: relay.terminal.logSequence, entryDigest: relay.terminal.entryDigest, kind: relay.terminal.kind },
    source: Object.fromEntries(Object.entries(relay.source).reverse()),
  });
  assert.equal(rebuilt.relayId, relay.relayId);
  assert.deepEqual(canonicalFeatureFlightRelayBytesV1(rebuilt), canonicalFeatureFlightRelayBytesV1(relay));

  const changed = createFeatureFlightRelayV1({
    source: relay.source,
    terminal: relay.terminal,
    recipient: { ...relay.recipient, laneId: "lane:other" },
    requestedObservation: relay.requestedObservation,
  });
  assert.notEqual(changed.relayId, relay.relayId);
  assert.throws(() => createFeatureFlightRelayV1({ ...{
    source: relay.source, terminal: relay.terminal, recipient: relay.recipient, requestedObservation: relay.requestedObservation,
  }, prompt: "wake the controller" }), /fields are not closed/u);
  assert.equal(canonicalFeatureFlightRelayBytesV1(relay).includes(Buffer.from("evidence:terminal:248")), false);
});

test("accepts only an exact single terminal replay projection and matching lastEntryDigest", async () => {
  const start = started();
  for (const kind of ["dispatch.started", "dispatch.interrupted", "dispatch.resumed"]) {
    const entries = kind === "dispatch.started" ? [start] : kind === "dispatch.interrupted"
      ? [start, lifecycle(start, kind)]
      : (() => { const interrupted = lifecycle(start, "dispatch.interrupted"); return [start, interrupted, lifecycle(interrupted, kind)]; })();
    const result = await createFeatureFlightRelayFromSeatDispatchV1(creationInput(), dependencies(entries));
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "terminal_source_required");
  }

  const terminal = lifecycle(start, "dispatch.completed");
  const validReplay = replaySeatDispatchReceiptsV1([start, terminal]);
  const ambiguous = await createFeatureFlightRelayFromSeatDispatchV1(creationInput(), dependencies([start, terminal], {
    ...validReplay,
    projections: [validReplay.projections[0], structuredClone(validReplay.projections[0])],
  }));
  assert.equal(ambiguous.code, "terminal_source_ambiguous");

  const missingEntry = await createFeatureFlightRelayFromSeatDispatchV1(creationInput(), dependencies([start, terminal], {
    ...validReplay,
    entries: [start],
  }));
  assert.equal(missingEntry.code, "terminal_source_ambiguous");

  const malformed = await createFeatureFlightRelayFromSeatDispatchV1(creationInput(), dependencies([start, terminal], {
    state: "invalid", code: "digest_mismatch", reasonCodes: [],
  }));
  assert.equal(malformed.code, "source_replay_invalid");
});

test("rejects every stale source identity and recipient mismatch", async () => {
  const mismatches = {
    receiptId: "receipt:other", dispatchId: "dispatch:other", parentMissionId: "mission:other",
    parentMissionRevision: "5".repeat(40), parentSessionId: "session:other", childTaskId: "task:other",
    childSessionId: "child-session:other", sourceAccountableSeatId: "daisy", repositoryId: "repo:other",
    repositoryWorkspaceId: "workspace:other", repositoryRevision: "6".repeat(40), subjectId: "issue:other",
    subjectRevision: "7".repeat(40), artifactId: "artifact:other", artifactRevision: "8".repeat(40),
  };
  const start = started();
  const terminal = lifecycle(start, "dispatch.failed");
  for (const [field, value] of Object.entries(mismatches)) {
    const result = await createFeatureFlightRelayFromSeatDispatchV1(creationInput({ [field]: value }), dependencies([start, terminal]));
    assert.equal(result.code, "terminal_source_ambiguous", field);
  }
  const badSeat = await createFeatureFlightRelayFromSeatDispatchV1(creationInput({ recipientSeatId: "may" }), dependencies([start, terminal]));
  assert.equal(badSeat.code, "malformed_input");

  const { relay } = await relayFrom();
  const entry = createFeatureFlightRelayEntryV1({ logSequence: 0, previousLogDigest: null, relay });
  const mismatch = replayFeatureFlightRelayLedgerV1([entry], { ...relay.recipient, laneId: "lane:other" });
  assert.equal(mismatch.code, "recipient_mismatch");
});

test("rejects unknown fields, unsupported observation, accessors, and proxies without invoking them", async () => {
  const start = started();
  const terminal = lifecycle(start, "dispatch.cancelled");
  const unknown = await createFeatureFlightRelayFromSeatDispatchV1({ ...creationInput(), done: true }, dependencies([start, terminal]));
  assert.equal(unknown.code, "malformed_input");
  const prose = await createFeatureFlightRelayFromSeatDispatchV1(creationInput({ requestedObservation: "PACKET_COMPLETE" }), dependencies([start, terminal]));
  assert.equal(prose.code, "malformed_input");
  let accesses = 0;
  const accessor = creationInput();
  Object.defineProperty(accessor, "receiptId", { enumerable: true, get() { accesses += 1; return "receipt:forged"; } });
  assert.equal((await createFeatureFlightRelayFromSeatDispatchV1(accessor, dependencies([start, terminal]))).code, "malformed_input");
  assert.equal(accesses, 0);
  const proxy = new Proxy(creationInput(), { get() { accesses += 1; throw new Error("executed"); } });
  assert.equal((await createFeatureFlightRelayFromSeatDispatchV1(proxy, dependencies([start, terminal]))).code, "malformed_input");
  assert.equal(accesses, 0);
});

test("replays only one pending lifecycle entry and projects await_delivery_binding", async () => {
  const { relay } = await relayFrom();
  const entry = createFeatureFlightRelayEntryV1({ logSequence: 0, previousLogDigest: null, relay });
  assert.equal(validateFeatureFlightRelayEntryV1(entry).state, "valid");
  const replay = replayFeatureFlightRelayLedgerV1([entry]);
  assert.equal(replay.state, "valid");
  assert.equal(replay.inspection.pending[0].lifecycleState, "pending");
  assert.equal(replay.inspection.pending[0].nextAction, FEATURE_FLIGHT_RELAY_NEXT_ACTION);
  assert.equal(replay.inspection.pending[0].repositoryRevision, REVISION);
  assert.equal(replay.inspection.pending[0].authority, "none");
  assert.equal(inspectFeatureFlightRelaysV1([entry]).pending.length, 1);

  const retry = reconcileFeatureFlightRelayEntryV1([entry], entry);
  assert.equal(retry.state, "duplicate");
  assert.equal(retry.appended, false);
  assert.equal(replayFeatureFlightRelayLedgerV1([entry, entry]).code, "duplicate_event");

  const conflictRelay = createFeatureFlightRelayV1({
    source: relay.source,
    terminal: relay.terminal,
    recipient: { ...relay.recipient, controllerIdentity: "controller:hill:other" },
    requestedObservation: relay.requestedObservation,
  });
  const conflict = createFeatureFlightRelayEntryV1({ logSequence: 1, previousLogDigest: entry.entryDigest, relay: conflictRelay });
  assert.equal(reconcileFeatureFlightRelayEntryV1([entry], conflict).code, "conflicting_reuse");
});

test("derives one closed authority-none delivery receipt and pending-to-delivered entry", async () => {
  const { relay } = await relayFrom();
  const pending = createFeatureFlightRelayEntryV1({ logSequence: 0, previousLogDigest: null, relay });
  const receipt = createFeatureFlightRelayDeliveryReceiptV1({ relay });
  assert.equal(receipt.contractVersion, FEATURE_FLIGHT_RELAY_DELIVERY_RECEIPT_CONTRACT_VERSION);
  assert.equal(receipt.authority, "none");
  assert.match(receipt.deliveryKey, /^relay-delivery:[A-Za-z0-9_-]{43}$/u);
  assert.equal(validateFeatureFlightRelayDeliveryReceiptV1(receipt, relay).state, "valid");
  assert.deepEqual(Object.keys(receipt).sort(), [
    "artifactType", "authority", "contractVersion", "deliveryKey", "notice", "receiptDigest", "recipient", "relayDigest",
    "relayId", "repositoryId", "repositoryRevision", "repositoryWorkspaceId", "schemaVersion",
  ]);

  const delivered = createFeatureFlightRelayDeliveredEntryV1({
    logSequence: 1,
    previousLogDigest: pending.entryDigest,
    pendingEntry: pending,
  });
  assert.equal(delivered.kind, "relay.delivered");
  assert.equal(delivered.contractVersion, FEATURE_FLIGHT_RELAY_DELIVERED_CONTRACT_VERSION);
  assert.equal(delivered.lifecycleSequence, 1);
  assert.equal(delivered.previousLifecycleDigest, pending.entryDigest);
  assert.deepEqual(delivered.deliveryReceipt, receipt);
  assert.equal(validateFeatureFlightRelayEntryV1(delivered).state, "valid");

  const replay = replayFeatureFlightRelayLedgerV1([pending, delivered]);
  assert.equal(replay.state, "valid");
  assert.equal(replay.inspection.pending.length, 0);
  assert.equal(replay.inspection.delivered[0].lifecycleState, "delivered");
  assert.equal(replay.inspection.delivered[0].nextAction, FEATURE_FLIGHT_RELAY_DELIVERED_NEXT_ACTION);
  assert.equal(replay.inspection.delivered[0].authority, "none");
  assert.deepEqual(replay.inspection.delivered[0].deliveryReceipt, receipt);
});

test("reconciles only the exact delivery binding and returns exact durable retries as duplicate", async () => {
  const { relay } = await relayFrom();
  const pending = createFeatureFlightRelayEntryV1({ logSequence: 0, previousLogDigest: null, relay });
  const expected = {
    relayId: relay.relayId,
    relayDigest: relay.relayDigest,
    repositoryId: relay.source.repositoryId,
    repositoryWorkspaceId: relay.source.repositoryWorkspaceId,
    repositoryRevision: relay.source.repositoryRevision,
    recipient: relay.recipient,
  };
  const accepted = reconcileFeatureFlightRelayDeliveryV1([pending], expected);
  assert.equal(accepted.state, "accepted");
  assert.equal(accepted.appended, true);
  assert.equal(accepted.entry.kind, "relay.delivered");
  const duplicate = reconcileFeatureFlightRelayDeliveryV1([pending, accepted.entry], expected);
  assert.equal(duplicate.state, "duplicate");
  assert.equal(duplicate.code, "duplicate");
  assert.equal(duplicate.appended, false);
  assert.equal(duplicate.entry.entryDigest, accepted.entry.entryDigest);
  assert.deepEqual(duplicate.deliveryReceipt, accepted.deliveryReceipt);

  assert.equal(reconcileFeatureFlightRelayDeliveryV1([], expected).code, "relay_missing");
  assert.equal(reconcileFeatureFlightRelayDeliveryV1([pending], { ...expected, relayDigest: featureFlightRelayDigestV1("other") }).code, "conflicting_reuse");
  assert.equal(reconcileFeatureFlightRelayDeliveryV1([pending], { ...expected, repositoryId: "repo:other" }).code, "relay_missing");
  assert.equal(reconcileFeatureFlightRelayDeliveryV1([pending], { ...expected, repositoryRevision: "5".repeat(40) }).code, "source_stale");
  for (const [field, value] of [["seatId", "may"], ["laneId", "lane:other"], ["controllerIdentity", "controller:other"]]) {
    assert.equal(reconcileFeatureFlightRelayDeliveryV1([pending], {
      ...expected,
      recipient: { ...expected.recipient, [field]: value },
    }).code, "recipient_mismatch", field);
  }
  assert.equal(reconcileFeatureFlightRelayDeliveryV1([pending], { ...expected, extra: true }).code, "malformed_input");
  assert.deepEqual(FEATURE_FLIGHT_RELAY_DELIVERY_RESULT_CODES, [
    "relay_missing", "delivery_missing", "recipient_mismatch", "source_stale", "delivery_stale", "duplicate",
    "conflicting_reuse", "illegal_transition", "recovery_required",
  ]);
});

test("rejects skipped, reversed, repeated, post-delivery, and malformed delivery lifecycles", async () => {
  const { relay } = await relayFrom();
  const pending = createFeatureFlightRelayEntryV1({ logSequence: 0, previousLogDigest: null, relay });
  const delivered = createFeatureFlightRelayDeliveredEntryV1({
    logSequence: 1,
    previousLogDigest: pending.entryDigest,
    pendingEntry: pending,
  });
  assert.equal(replayFeatureFlightRelayLedgerV1([delivered]).state, "invalid");

  const secondPending = createFeatureFlightRelayEntryV1({ logSequence: 1, previousLogDigest: pending.entryDigest, relay });
  assert.equal(replayFeatureFlightRelayLedgerV1([pending, secondPending]).code, "conflicting_reuse");
  assert.equal(reconcileFeatureFlightRelayEntryV1([pending], delivered).state, "accepted");
  assert.equal(reconcileFeatureFlightRelayEntryV1([pending, delivered], delivered).state, "duplicate");

  const skipped = structuredClone(delivered);
  skipped.lifecycleSequence = 2;
  assert.equal(validateFeatureFlightRelayEntryV1(skipped).state, "invalid");
  const wrongPredecessor = structuredClone(delivered);
  wrongPredecessor.previousLifecycleDigest = featureFlightRelayDigestV1("wrong predecessor");
  wrongPredecessor.entryDigest = featureFlightRelayDigestV1(
    Object.fromEntries(Object.entries(wrongPredecessor).filter(([field]) => !["entryId", "entryDigest"].includes(field))),
    "shield.feature-flight-relay.delivered.entry.v1",
  );
  assert.equal(replayFeatureFlightRelayLedgerV1([pending, wrongPredecessor]).code, "lifecycle_chain_invalid");

  const postDelivery = structuredClone(delivered);
  postDelivery.logSequence = 2;
  postDelivery.previousLogDigest = delivered.entryDigest;
  postDelivery.previousLifecycleDigest = delivered.entryDigest;
  postDelivery.entryDigest = featureFlightRelayDigestV1(
    Object.fromEntries(Object.entries(postDelivery).filter(([field]) => !["entryId", "entryDigest"].includes(field))),
    "shield.feature-flight-relay.delivered.entry.v1",
  );
  assert.equal(replayFeatureFlightRelayLedgerV1([pending, delivered, postDelivery]).code, "conflicting_reuse");

  assert.equal(validateFeatureFlightRelayDeliveryReceiptV1({ ...delivered.deliveryReceipt, receiptDigest: featureFlightRelayDigestV1("forged") }).code, "delivery_stale");
  assert.equal(validateFeatureFlightRelayDeliveryReceiptV1({ ...delivered.deliveryReceipt, unknown: true }).code, "delivery_stale");
  assert.equal(validateFeatureFlightRelayDeliveryReceiptV1(new Proxy({}, {})).code, "delivery_stale");
  assert.throws(() => createFeatureFlightRelayDeliveredEntryV1({
    logSequence: 1,
    previousLogDigest: pending.entryDigest,
    pendingEntry: pending,
    acknowledgement: true,
  }), /fields are not closed/u);
});

test("preserves literal Slice 1 and Slice 2 bytes plus exact legacy replay and conditional omissions", () => {
  const pending = JSON.parse(SLICE_1_PENDING_ENTRY_BYTES.toString("utf8"));
  const delivered = JSON.parse(SLICE_2_DELIVERED_ENTRY_BYTES.toString("utf8"));
  assert.deepEqual(canonicalFeatureFlightRelayBytesV1(pending), SLICE_1_PENDING_ENTRY_BYTES);
  assert.deepEqual(canonicalFeatureFlightRelayBytesV1(delivered), SLICE_2_DELIVERED_ENTRY_BYTES);
  assert.equal(validateFeatureFlightRelayEntryV1(delivered).state, "valid");
  const pendingReplay = replayFeatureFlightRelayLedgerV1([pending]);
  const deliveredReplay = replayFeatureFlightRelayLedgerV1([pending, delivered]);
  assert.deepEqual(pendingReplay.entries, [pending]);
  assert.deepEqual(deliveredReplay.entries, [pending, delivered]);
  assert.equal(Object.hasOwn(pendingReplay.inspection, "delivered"), false);
  assert.equal(Object.hasOwn(pendingReplay.inspection, "acknowledged"), false);
  assert.equal(Object.hasOwn(deliveredReplay.inspection, "acknowledged"), false);
  assert.deepEqual(deliveredReplay.inspection.delivered, [
    {
      schemaVersion: 1,
      artifactType: "feature-flight-relay-projection",
      contractVersion: FEATURE_FLIGHT_RELAY_CONTRACT_VERSION,
      authority: "none",
      notice: "Read-only advisory projection. Await a separately authorized delivery binding.",
      relayId: delivered.relayId,
      relayDigest: delivered.relayDigest,
      source: delivered.relay.source,
      terminal: delivered.relay.terminal,
      recipient: delivered.relay.recipient,
      lifecycleState: "delivered",
      repositoryRevision: delivered.relay.source.repositoryRevision,
      nextAction: FEATURE_FLIGHT_RELAY_DELIVERED_NEXT_ACTION,
      lastEntryDigest: delivered.entryDigest,
      deliveryReceipt: delivered.deliveryReceipt,
    },
  ]);
});

test("derives a closed authority-none acknowledgement only from delivered and authoritative evidence", async () => {
  const { relay, entries } = await relayFrom();
  const pending = createFeatureFlightRelayEntryV1({ logSequence: 0, previousLogDigest: null, relay });
  const delivered = createFeatureFlightRelayDeliveredEntryV1({
    logSequence: 1,
    previousLogDigest: pending.entryDigest,
    pendingEntry: pending,
  });
  const sourceReplay = replaySeatDispatchReceiptsV1(entries);
  const acknowledgementResult = createFeatureFlightRelayAcknowledgementV1({ deliveredEntry: delivered, sourceReplay });
  assert.equal(acknowledgementResult.state, "valid", acknowledgementResult.reasonCodes?.join(" "));
  const acknowledgement = acknowledgementResult.value;
  assert.equal(acknowledgement.contractVersion, FEATURE_FLIGHT_RELAY_ACKNOWLEDGED_CONTRACT_VERSION);
  assert.equal(acknowledgement.authority, "none");
  assert.equal(acknowledgement.notice, FEATURE_FLIGHT_RELAY_ACKNOWLEDGEMENT_NOTICE);
  assert.equal(acknowledgement.outcome, "authoritative_terminal_observed");
  assert.equal(acknowledgement.deliveredEntryDigest, delivered.entryDigest);
  assert.equal(acknowledgement.deliveryReceiptDigest, delivered.deliveryReceipt.receiptDigest);
  assert.deepEqual(acknowledgement.recipient, relay.recipient);
  assert.deepEqual(acknowledgement.terminal, relay.terminal);
  assert.equal(validateFeatureFlightRelayAcknowledgementV1(acknowledgement, delivered).state, "valid");
  assert.deepEqual(Object.keys(acknowledgement).sort(), [
    "acknowledgementDigest", "artifactType", "authority", "contractVersion", "deliveredEntryDigest", "deliveryReceiptDigest",
    "dispatchId", "notice", "outcome", "receiptId", "recipient", "relayDigest", "relayId", "repositoryId",
    "repositoryRevision", "repositoryWorkspaceId", "schemaVersion", "terminal",
  ]);

  const acknowledgedResult = createFeatureFlightRelayAcknowledgedEntryV1({
    logSequence: 2,
    previousLogDigest: delivered.entryDigest,
    deliveredEntry: delivered,
    sourceReplay,
  });
  assert.equal(acknowledgedResult.state, "valid", acknowledgedResult.reasonCodes?.join(" "));
  const acknowledged = acknowledgedResult.value;
  assert.equal(acknowledged.kind, "relay.acknowledged");
  assert.equal(acknowledged.lifecycleSequence, 2);
  assert.equal(acknowledged.previousLifecycleDigest, delivered.entryDigest);
  assert.deepEqual(acknowledged.acknowledgement, acknowledgement);
  assert.equal(validateFeatureFlightRelayEntryV1(acknowledged).state, "valid");
  assert.equal(createFeatureFlightRelayAcknowledgedEntryV1({
    logSequence: 2,
    previousLogDigest: delivered.entryDigest,
    deliveredEntry: delivered,
    sourceReplay,
    outcome: "caller_controlled",
  }).code, "malformed_input");
});

test("replays pending to delivered to acknowledged and projects closed no-action inspection", async () => {
  const { relay, entries } = await relayFrom("dispatch.failed");
  const pending = createFeatureFlightRelayEntryV1({ logSequence: 0, previousLogDigest: null, relay });
  const delivered = createFeatureFlightRelayDeliveredEntryV1({
    logSequence: 1,
    previousLogDigest: pending.entryDigest,
    pendingEntry: pending,
  });
  const acknowledged = createFeatureFlightRelayAcknowledgedEntryV1({
    logSequence: 2,
    previousLogDigest: delivered.entryDigest,
    deliveredEntry: delivered,
    sourceReplay: replaySeatDispatchReceiptsV1(entries),
  }).value;
  const replay = replayFeatureFlightRelayLedgerV1([pending, delivered, acknowledged]);
  assert.equal(replay.state, "valid");
  assert.equal(replay.inspection.pending.length, 0);
  assert.equal(Object.hasOwn(replay.inspection, "delivered"), false);
  assert.equal(replay.inspection.acknowledged.length, 1);
  assert.equal(replay.inspection.acknowledged[0].lifecycleState, "acknowledged");
  assert.equal(replay.inspection.acknowledged[0].nextAction, FEATURE_FLIGHT_RELAY_ACKNOWLEDGED_NEXT_ACTION);
  assert.equal(replay.inspection.acknowledged[0].authority, "none");
  assert.equal(replay.inspection.acknowledged[0].notice, FEATURE_FLIGHT_RELAY_ACKNOWLEDGEMENT_NOTICE);
  assert.deepEqual(replay.inspection.acknowledged[0].acknowledgement, acknowledged.acknowledgement);

  assert.equal(replayFeatureFlightRelayLedgerV1([pending, acknowledged]).code, "global_chain_invalid");
  assert.equal(replayFeatureFlightRelayLedgerV1([pending, delivered, delivered]).code, "duplicate_event");
  assert.equal(replayFeatureFlightRelayLedgerV1([pending, delivered, acknowledged, acknowledged]).code, "duplicate_event");
  assert.equal(reconcileFeatureFlightRelayEntryV1([pending, delivered], acknowledged).code, "illegal_transition");
  const reversed = structuredClone(acknowledged);
  reversed.previousLifecycleDigest = pending.entryDigest;
  reversed.entryDigest = featureFlightRelayDigestV1(
    Object.fromEntries(Object.entries(reversed).filter(([field]) => !["entryId", "entryDigest"].includes(field))),
    "shield.feature-flight-relay.acknowledged.entry.v1",
  );
  assert.equal(replayFeatureFlightRelayLedgerV1([pending, delivered, reversed]).code, "lifecycle_chain_invalid");
});

test("reconciles exact acknowledgement retries and closes source, recipient, and terminal failures", async () => {
  const { relay, entries } = await relayFrom();
  const pending = createFeatureFlightRelayEntryV1({ logSequence: 0, previousLogDigest: null, relay });
  const delivered = createFeatureFlightRelayDeliveredEntryV1({
    logSequence: 1,
    previousLogDigest: pending.entryDigest,
    pendingEntry: pending,
  });
  const sourceReplay = replaySeatDispatchReceiptsV1(entries);
  const expected = { relayId: relay.relayId, relayDigest: relay.relayDigest, source: relay.source, recipient: relay.recipient };
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([], expected, sourceReplay).code, "relay_missing");
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending], expected, sourceReplay).code, "delivery_missing");
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], {
    ...expected,
    relayDigest: featureFlightRelayDigestV1("conflict"),
  }, sourceReplay).code, "conflicting_reuse");
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], {
    ...expected,
    source: { ...expected.source, repositoryId: "repo:other" },
  }, sourceReplay).code, "relay_missing");
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], {
    ...expected,
    source: { ...expected.source, repositoryRevision: "5".repeat(40) },
  }, sourceReplay).code, "source_stale");
  const sourceMismatches = {
    receiptId: "receipt:other", dispatchId: "dispatch:other", parentMissionId: "mission:other",
    parentMissionRevision: "5".repeat(40), parentSessionId: "session:other", childTaskId: "task:other",
    childSessionId: "session:other", sourceAccountableSeatId: "daisy", repositoryId: "repo:other",
    repositoryWorkspaceId: "workspace:other", subjectId: "issue:other", subjectRevision: "5".repeat(40),
    artifactId: "artifact:other", artifactRevision: "5".repeat(40),
  };
  for (const [field, value] of Object.entries(sourceMismatches)) {
    assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], {
      ...expected,
      source: { ...expected.source, [field]: value },
    }, sourceReplay).code, "relay_missing", field);
  }
  for (const [field, value] of [["seatId", "may"], ["laneId", "lane:other"], ["controllerIdentity", "controller:other"]]) {
    const result = reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], {
      ...expected,
      recipient: { ...expected.recipient, [field]: value },
    }, sourceReplay);
    assert.equal(result.code, "recipient_mismatch", field);
  }
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], { ...expected, extra: true }, sourceReplay).code, "malformed_input");

  const accepted = reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], expected, sourceReplay);
  assert.equal(accepted.state, "accepted", accepted.reasonCodes?.join(" "));
  assert.equal(accepted.appended, true);
  const duplicate = reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered, accepted.entry], expected);
  assert.equal(duplicate.state, "duplicate");
  assert.equal(duplicate.code, "duplicate");
  assert.equal(duplicate.appended, false);
  assert.deepEqual(duplicate.acknowledgement, accepted.acknowledgement);

  const nonTerminalReplay = replaySeatDispatchReceiptsV1([entries[0]]);
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], expected, nonTerminalReplay).code, "terminal_source_required");
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], expected, {
    state: "invalid", code: "digest_mismatch", reasonCodes: [],
  }).code, "source_replay_invalid");
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], expected, {
    ...sourceReplay,
    projections: [sourceReplay.projections[0], structuredClone(sourceReplay.projections[0])],
  }).code, "terminal_source_ambiguous");
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], expected, {
    ...sourceReplay,
    entries: [entries[0]],
  }).code, "terminal_source_ambiguous");
  const mismatchedTerminal = structuredClone(sourceReplay);
  mismatchedTerminal.entries[1].kind = "dispatch.failed";
  assert.equal(reconcileFeatureFlightRelayAcknowledgementV1([pending, delivered], expected, mismatchedTerminal).code, "terminal_source_mismatch");
  assert.deepEqual(FEATURE_FLIGHT_RELAY_ACKNOWLEDGEMENT_RESULT_CODES, [
    "relay_missing", "delivery_missing", "source_ledger_unavailable", "source_replay_invalid", "terminal_source_ambiguous",
    "terminal_source_required", "terminal_source_mismatch", "recipient_mismatch", "source_stale", "duplicate",
    "conflicting_reuse", "illegal_transition", "recovery_required",
  ]);
});

test("canonical helper rejects unsafe values", () => {
  assert.throws(() => featureFlightRelayDigestV1({ number: 0.5 }), /safe integers/u);
  assert.equal(validateFeatureFlightRelayV1(new Proxy({}, {})).state, "invalid");
});
