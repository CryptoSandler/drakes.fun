# Clean fixture

A piece is issued once an hour. The first piece was issued at genesis. The
second piece was issued an hour later, and the third piece was issued an hour
after that. Nothing is bought and nothing is entered: a piece is issued to a
holder in proportion to their share of eligible supply.

When a piece is issued, the recipient is recorded. When the next piece is
issued, the recipient is recorded again. Every piece that has been issued is
recomputable by a stranger from the slot at which it was issued.

If eligible supply is zero, no piece is issued, and the index does not advance.
The hour is lost. The piece that would have been issued is not issued later; it
is simply never issued at all.

Once four thousand pieces have been issued, nothing further is issued. The
clock keeps running and the protocol keeps reporting that nothing was issued.

Every piece issued carries the same share of the reserve as every other piece
issued, regardless of what it looks like. A piece issued at the beginning and a
piece issued at the end redeem for the same amount. That a piece was issued
early confers no economic advantage; it is issued, and that is all.
