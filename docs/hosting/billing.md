# Hosting billing

Hosting billing is separate from marketplace orders. `HostingInvoice` stores an immutable plan and amount snapshot, and `HostingPayment` stores manual payment proof metadata and reviewer state.

Paid plans must remain inactive until an authorized admin verifies the actual KBZPay/WavePay transfer. Screenshots alone must never activate a subscription. Recurring billing is not implemented; renewal requires a documented, verified payment workflow.
