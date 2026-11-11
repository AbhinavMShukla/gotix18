GOTIX 18 Turn Alert Update
Online 120s turn timer; final 10 seconds tone and animation; third timeout forfeits.
Firebase document fields: turnDeadline (milliseconds), timeoutCounts {P1,P2}.
Both players MUST install this version; older builds may overwrite turn deadline or fail to show timeout result.
Firestore rules must protect game state and enforce authorized updates before public launch.
Online deadline uses device clock for display/transaction: clock skew can affect fairness; production should use server-authoritative time.
Original 37-node board geometry and move logic unchanged.
Test with two physical devices and synchronized clocks.
