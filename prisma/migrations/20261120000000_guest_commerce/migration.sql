ALTER TABLE "Cart" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Cart" ADD COLUMN "guestId" TEXT;
CREATE UNIQUE INDEX "Cart_guestId_key" ON "Cart"("guestId");

ALTER TABLE "WishlistItem" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "WishlistItem" ADD COLUMN "guestId" TEXT;
CREATE UNIQUE INDEX "WishlistItem_guestId_productId_key" ON "WishlistItem"("guestId", "productId");
CREATE INDEX "WishlistItem_guestId_createdAt_idx" ON "WishlistItem"("guestId", "createdAt");
