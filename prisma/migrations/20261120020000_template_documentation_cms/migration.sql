CREATE TYPE "TemplateAccessLevel" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'PURCHASER');

CREATE TABLE "TemplateDetail" (
  "id" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "fullDescription" TEXT NOT NULL,
  "requirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "version" TEXT,
  "releaseDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplateDetail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateFeature" (
  "id" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemplateFeature_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateScreenshot" (
  "id" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "altText" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemplateScreenshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateDocumentation" (
  "id" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "accessLevel" "TemplateAccessLevel" NOT NULL DEFAULT 'PUBLIC',
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplateDocumentation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateDocumentSection" (
  "id" UUID NOT NULL,
  "documentationId" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplateDocumentSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplatePdfFile" (
  "id" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "storageKey" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "version" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "accessLevel" "TemplateAccessLevel" NOT NULL DEFAULT 'PURCHASER',
  "downloadEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplatePdfFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateDesignSettings" (
  "id" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "pageBackground" TEXT NOT NULL DEFAULT '#0B0D14',
  "cardBackground" TEXT NOT NULL DEFAULT '#151722',
  "accentColor" TEXT NOT NULL DEFAULT '#7967F4',
  "headingColor" TEXT NOT NULL DEFAULT '#F8F9FC',
  "bodyColor" TEXT NOT NULL DEFAULT '#A6A7BA',
  "contentWidth" TEXT NOT NULL DEFAULT '1180px',
  "imageAspectRatio" TEXT NOT NULL DEFAULT '16/9',
  "spacing" TEXT NOT NULL DEFAULT 'comfortable',
  "borderRadius" TEXT NOT NULL DEFAULT '24px',
  "layout" TEXT NOT NULL DEFAULT 'premium',
  "showDocumentation" BOOLEAN NOT NULL DEFAULT true,
  "showScreenshots" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplateDesignSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TemplateDetail_templateId_key" ON "TemplateDetail"("templateId");
CREATE INDEX "TemplateFeature_templateId_sortOrder_idx" ON "TemplateFeature"("templateId", "sortOrder");
CREATE INDEX "TemplateScreenshot_templateId_sortOrder_idx" ON "TemplateScreenshot"("templateId", "sortOrder");
CREATE UNIQUE INDEX "TemplateDocumentation_templateId_key" ON "TemplateDocumentation"("templateId");
CREATE UNIQUE INDEX "TemplateDocumentSection_documentationId_slug_key" ON "TemplateDocumentSection"("documentationId", "slug");
CREATE INDEX "TemplateDocumentSection_documentationId_sortOrder_idx" ON "TemplateDocumentSection"("documentationId", "sortOrder");
CREATE INDEX "TemplatePdfFile_templateId_sortOrder_idx" ON "TemplatePdfFile"("templateId", "sortOrder");
CREATE INDEX "TemplatePdfFile_templateId_accessLevel_isVisible_idx" ON "TemplatePdfFile"("templateId", "accessLevel", "isVisible");
CREATE UNIQUE INDEX "TemplateDesignSettings_templateId_key" ON "TemplateDesignSettings"("templateId");

ALTER TABLE "TemplateDetail" ADD CONSTRAINT "TemplateDetail_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateFeature" ADD CONSTRAINT "TemplateFeature_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateScreenshot" ADD CONSTRAINT "TemplateScreenshot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateDocumentation" ADD CONSTRAINT "TemplateDocumentation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateDocumentSection" ADD CONSTRAINT "TemplateDocumentSection_documentationId_fkey" FOREIGN KEY ("documentationId") REFERENCES "TemplateDocumentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplatePdfFile" ADD CONSTRAINT "TemplatePdfFile_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateDesignSettings" ADD CONSTRAINT "TemplateDesignSettings_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
