-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "appleNoteId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "appleCreatedAt" DATETIME,
    "appleModifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Note_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("appleCreatedAt", "appleModifiedAt", "appleNoteId", "body", "contactId", "createdAt", "dealId", "id", "title", "updatedAt") SELECT "appleCreatedAt", "appleModifiedAt", "appleNoteId", "body", "contactId", "createdAt", "dealId", "id", "title", "updatedAt" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE UNIQUE INDEX "Note_appleNoteId_key" ON "Note"("appleNoteId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
