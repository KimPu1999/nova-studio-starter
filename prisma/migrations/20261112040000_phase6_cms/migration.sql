-- Phase 6: database-backed CMS, branding, navigation, SEO, translations, and revisions.
CREATE TYPE "CmsContentStatus" AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE "ThemeMode" AS ENUM ('DARK','LIGHT','SYSTEM');

CREATE TABLE "BrandSetting" (
  "id" UUID NOT NULL,
  "singletonKey" TEXT NOT NULL DEFAULT 'default',
  "brandName" TEXT NOT NULL DEFAULT 'NOVA Studio',
  "brandDescription" TEXT,
  "logoStorageKey" TEXT,
  "darkLogoStorageKey" TEXT,
  "lightLogoStorageKey" TEXT,
  "faviconStorageKey" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#8B5CF6',
  "secondaryColor" TEXT NOT NULL DEFAULT '#171725',
  "accentColor" TEXT NOT NULL DEFAULT '#22D3EE',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BrandSetting_singletonKey_key" ON "BrandSetting"("singletonKey");

CREATE TABLE "AppearanceSetting" (
  "id" UUID NOT NULL,
  "singletonKey" TEXT NOT NULL DEFAULT 'default',
  "mode" "ThemeMode" NOT NULL DEFAULT 'DARK',
  "backgroundColor" TEXT NOT NULL DEFAULT '#09090F',
  "surfaceColor" TEXT NOT NULL DEFAULT '#171725',
  "primaryColor" TEXT NOT NULL DEFAULT '#8B5CF6',
  "accentColor" TEXT NOT NULL DEFAULT '#22D3EE',
  "textColor" TEXT NOT NULL DEFAULT '#F8FAFC',
  "headingFont" TEXT NOT NULL DEFAULT 'Inter',
  "bodyFont" TEXT NOT NULL DEFAULT 'Inter',
  "borderRadius" TEXT NOT NULL DEFAULT 'medium',
  "buttonStyle" TEXT NOT NULL DEFAULT 'rounded',
  "cardStyle" TEXT NOT NULL DEFAULT 'bordered',
  "layoutWidth" TEXT NOT NULL DEFAULT 'wide',
  "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppearanceSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppearanceSetting_singletonKey_key" ON "AppearanceSetting"("singletonKey");

CREATE TABLE "HomepageSection" (
  "id" UUID NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "status" "CmsContentStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomepageSection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HomepageSection_sectionKey_key" ON "HomepageSection"("sectionKey");
CREATE INDEX "HomepageSection_status_sortOrder_idx" ON "HomepageSection"("status","sortOrder");

CREATE TABLE "NavigationMenu" (
  "id" UUID NOT NULL,
  "location" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CmsContentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NavigationMenu_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NavigationMenu_location_key" ON "NavigationMenu"("location");

CREATE TABLE "NavigationItem" (
  "id" UUID NOT NULL,
  "menuId" UUID NOT NULL,
  "parentId" UUID,
  "label" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "openInNewTab" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "NavigationItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NavigationItem_menuId_sortOrder_idx" ON "NavigationItem"("menuId","sortOrder");

CREATE TABLE "CmsPage" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "status" "CmsContentStatus" NOT NULL DEFAULT 'DRAFT',
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "canonicalUrl" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CmsPage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CmsPage_slug_key" ON "CmsPage"("slug");
CREATE INDEX "CmsPage_status_updatedAt_idx" ON "CmsPage"("status","updatedAt");

CREATE TABLE "BlogCategory" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogCategory_name_key" ON "BlogCategory"("name");
CREATE UNIQUE INDEX "BlogCategory_slug_key" ON "BlogCategory"("slug");

CREATE TABLE "BlogPost" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "featuredImageStorageKey" TEXT,
  "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
  "categoryId" UUID,
  "authorId" UUID NOT NULL,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "canonicalUrl" TEXT,
  "readingTimeMinutes" INTEGER NOT NULL DEFAULT 1,
  "scheduledAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status","publishedAt");
CREATE INDEX "BlogPost_categoryId_status_idx" ON "BlogPost"("categoryId","status");

CREATE TABLE "BlogTag" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  CONSTRAINT "BlogTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogTag_name_key" ON "BlogTag"("name");
CREATE UNIQUE INDEX "BlogTag_slug_key" ON "BlogTag"("slug");

CREATE TABLE "BlogPostTag" (
  "postId" UUID NOT NULL,
  "tagId" UUID NOT NULL,
  CONSTRAINT "BlogPostTag_pkey" PRIMARY KEY ("postId","tagId")
);

CREATE TABLE "SeoMetadata" (
  "id" UUID NOT NULL,
  "routeKey" TEXT NOT NULL,
  "metaTitle" TEXT NOT NULL,
  "metaDescription" TEXT NOT NULL,
  "ogImageStorageKey" TEXT,
  "canonicalUrl" TEXT,
  "robots" TEXT NOT NULL DEFAULT 'index,follow',
  "structuredData" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoMetadata_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SeoMetadata_routeKey_key" ON "SeoMetadata"("routeKey");

CREATE TABLE "ContentTranslation" (
  "id" UUID NOT NULL,
  "locale" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentTranslation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentTranslation_locale_entityType_entityId_field_key" ON "ContentTranslation"("locale","entityType","entityId","field");
CREATE INDEX "ContentTranslation_locale_entityType_entityId_idx" ON "ContentTranslation"("locale","entityType","entityId");

CREATE TABLE "EmailTemplate" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

CREATE TABLE "SocialLink" (
  "id" UUID NOT NULL,
  "platform" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialLink_platform_key" ON "SocialLink"("platform");
CREATE INDEX "SocialLink_isEnabled_sortOrder_idx" ON "SocialLink"("isEnabled","sortOrder");

CREATE TABLE "SiteRevision" (
  "id" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "changedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SiteRevision_entityType_entityId_createdAt_idx" ON "SiteRevision"("entityType","entityId","createdAt");
CREATE INDEX "SiteRevision_changedById_createdAt_idx" ON "SiteRevision"("changedById","createdAt");

ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "NavigationMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NavigationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BlogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BlogPostTag" ADD CONSTRAINT "BlogPostTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogPostTag" ADD CONSTRAINT "BlogPostTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "BlogTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteRevision" ADD CONSTRAINT "SiteRevision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
