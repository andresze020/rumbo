# PR #37 Authenticated QA

> Authenticated real-data QA record for the hard-backlog integration merged to
> `main`. No real amounts, account numbers, balances, or transaction details
> are recorded here.

## Field guide

| Field | Meaning |
|---|---|
| Area | Flow under test. |
| Result | Passed, Partial, Failed, or Untested. |
| Evidence | Structural behavior observed in the authenticated app. |
| Follow-up | Exact remaining manual action. |

## Results — 2026-07-25

| Area | Result | Evidence | Follow-up |
|---|---|---|---|
| Transaction pagination | Passed | An all-time real-data query produced multiple pages. Page 1 showed the first range; page 2 preserved filters, total count and the expected next range. | Re-run after future changes to `search_household_transactions`. |
| Reports filters | Passed | A combined date range + income + merchant view produced the expected pressed flow state, filtered period, merchant distribution and clear-all action. | Add account/category/tag combinations to regression QA when those filters change. |
| CSV import history/revert | Partial | Authenticated import history loaded and showed imported, duplicate, invalid and reverted batch states without exposing soft-deleted rows to active totals. | Upload a sanitized fixture and verify active categorization-rule application in preview before confirming. |
| CSV categorization rules | Untested | The authenticated household currently has no rules, so application to preview rows could not be proven without creating persistent test data. | Create one temporary test rule and use a sanitized CSV fixture; archive the rule afterward. |
| Transfers | Partial | The transfer quick-add opened with distinct From/To account selectors and ledger-safe submit gating. Existing transfer rows render source → destination labels. | Submit same-currency and cross-currency fixtures, then reconcile both account balances. |
| Transfer costs | Partial | Existing integrated transfer-cost code is present, but the automated browser could not complete account-selector interaction to expose the cost panel. | Verify spread/fee estimate, same-currency fee, over-cost advisory and saved transaction detail manually. |
| Installed PWA shortcuts | Untested | Requires an OS-installed PWA; a normal authenticated browser tab is insufficient evidence. | Run the installed-app checklist in [pwa.md](../features/pwa.md#installed-app-verification). |
| PWA Share Target | Untested | Requires sharing from another installed app into the installed PWA. | Share text + URL and confirm expense quick-add prefills without auto-submitting. |

## QA Summary

- Passed: pagination and combined Reports filters.
- Failed: none observed.
- Doubts: transfer-cost panel interaction needs a manual device/browser pass.
- Untested: active CSV rule application; installed-PWA shortcuts and Share Target.
- Bugs found: none in the completed read-only checks.
- Recommended next sprint/fix: finish the three fixture/device checks above
  before calling the PR #37/PWA release gate fully closed.
