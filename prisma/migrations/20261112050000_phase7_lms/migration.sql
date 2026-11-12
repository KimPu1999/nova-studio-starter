-- Phase 7: courses, learning progress, assessment, certificates, reviews, and course purchases.
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE "LessonType" AS ENUM ('VIDEO','ARTICLE','QUIZ','ASSIGNMENT');
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE','COMPLETED','REVOKED');
CREATE TYPE "CoursePurchaseStatus" AS ENUM ('PENDING_PAYMENT','PAYMENT_REVIEW','PAID','CANCELLED','REFUNDED');
CREATE TYPE "QuizQuestionType" AS ENUM ('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE');
CREATE TYPE "AssignmentSubmissionStatus" AS ENUM ('SUBMITTED','GRADING','GRADED','RETURNED');
CREATE TYPE "CertificateStatus" AS ENUM ('ACTIVE','REVOKED');
CREATE TYPE "CourseReviewStatus" AS ENUM ('ACTIVE','HIDDEN');

CREATE TABLE "CourseCategory" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseCategory_name_key" ON "CourseCategory"("name");
CREATE UNIQUE INDEX "CourseCategory_slug_key" ON "CourseCategory"("slug");
CREATE INDEX "CourseCategory_createdAt_idx" ON "CourseCategory"("createdAt");

CREATE TABLE "Course" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "thumbnailStorageKey" TEXT,
  "categoryId" UUID NOT NULL,
  "instructorId" UUID NOT NULL,
  "difficulty" TEXT NOT NULL DEFAULT 'Beginner',
  "language" TEXT NOT NULL DEFAULT 'en',
  "priceMmk" INTEGER NOT NULL DEFAULT 0,
  "isFree" BOOLEAN NOT NULL DEFAULT true,
  "estimatedDurationMinutes" INTEGER,
  "prerequisites" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "learningOutcomes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");
CREATE INDEX "Course_status_createdAt_idx" ON "Course"("status","createdAt");
CREATE INDEX "Course_categoryId_status_idx" ON "Course"("categoryId","status");
CREATE INDEX "Course_instructorId_status_idx" ON "Course"("instructorId","status");
CREATE INDEX "Course_isFeatured_status_idx" ON "Course"("isFeatured","status");

CREATE TABLE "CourseSection" (
  "id" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseSection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CourseSection_courseId_sortOrder_idx" ON "CourseSection"("courseId","sortOrder");

CREATE TABLE "Lesson" (
  "id" UUID NOT NULL,
  "sectionId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "content" JSONB,
  "lessonType" "LessonType" NOT NULL DEFAULT 'ARTICLE',
  "videoStorageKey" TEXT,
  "videoDurationSeconds" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPreview" BOOLEAN NOT NULL DEFAULT false,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Lesson_sectionId_slug_key" ON "Lesson"("sectionId","slug");
CREATE INDEX "Lesson_sectionId_sortOrder_idx" ON "Lesson"("sectionId","sortOrder");
CREATE INDEX "Lesson_isPublished_isPreview_idx" ON "Lesson"("isPublished","isPreview");

CREATE TABLE "LessonResource" (
  "id" UUID NOT NULL,
  "lessonId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonResource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LessonResource_lessonId_createdAt_idx" ON "LessonResource"("lessonId","createdAt");

CREATE TABLE "CoursePurchase" (
  "id" UUID NOT NULL,
  "purchaseNumber" TEXT NOT NULL,
  "courseId" UUID NOT NULL,
  "buyerId" UUID NOT NULL,
  "unitPriceMmk" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MMK',
  "status" "CoursePurchaseStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "paymentMethodId" UUID,
  "transactionReference" TEXT,
  "proofStorageKey" TEXT,
  "proofMimeType" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "reviewerId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoursePurchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoursePurchase_purchaseNumber_key" ON "CoursePurchase"("purchaseNumber");
CREATE UNIQUE INDEX "CoursePurchase_idempotencyKey_key" ON "CoursePurchase"("idempotencyKey");
CREATE INDEX "CoursePurchase_courseId_status_createdAt_idx" ON "CoursePurchase"("courseId","status","createdAt");
CREATE INDEX "CoursePurchase_buyerId_status_createdAt_idx" ON "CoursePurchase"("buyerId","status","createdAt");

CREATE TABLE "CourseEnrollment" (
  "id" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "purchaseId" UUID,
  "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseEnrollment_purchaseId_key" ON "CourseEnrollment"("purchaseId");
CREATE UNIQUE INDEX "CourseEnrollment_courseId_studentId_key" ON "CourseEnrollment"("courseId","studentId");
CREATE INDEX "CourseEnrollment_studentId_status_enrolledAt_idx" ON "CourseEnrollment"("studentId","status","enrolledAt");

CREATE TABLE "LessonProgress" (
  "id" UUID NOT NULL,
  "enrollmentId" UUID NOT NULL,
  "lessonId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "lastPositionSeconds" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessonProgress_enrollmentId_lessonId_key" ON "LessonProgress"("enrollmentId","lessonId");
CREATE INDEX "LessonProgress_studentId_completed_idx" ON "LessonProgress"("studentId","completed");

CREATE TABLE "Quiz" ("id" UUID NOT NULL,"lessonId" UUID NOT NULL,"instructions" TEXT,"timeLimitSeconds" INTEGER,"passingScore" INTEGER NOT NULL DEFAULT 70,"attemptLimit" INTEGER NOT NULL DEFAULT 3,"randomize" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Quiz_lessonId_key" ON "Quiz"("lessonId");
CREATE TABLE "QuizQuestion" ("id" UUID NOT NULL,"quizId" UUID NOT NULL,"prompt" TEXT NOT NULL,"questionType" "QuizQuestionType" NOT NULL,"options" JSONB NOT NULL,"correctAnswer" JSONB NOT NULL,"points" INTEGER NOT NULL DEFAULT 1,"sortOrder" INTEGER NOT NULL DEFAULT 0,CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id"));
CREATE INDEX "QuizQuestion_quizId_sortOrder_idx" ON "QuizQuestion"("quizId","sortOrder");
CREATE TABLE "QuizAttempt" ("id" UUID NOT NULL,"quizId" UUID NOT NULL,"studentId" UUID NOT NULL,"attemptNumber" INTEGER NOT NULL,"score" INTEGER,"passed" BOOLEAN NOT NULL DEFAULT false,"startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"submittedAt" TIMESTAMP(3),CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "QuizAttempt_quizId_studentId_attemptNumber_key" ON "QuizAttempt"("quizId","studentId","attemptNumber");
CREATE INDEX "QuizAttempt_studentId_submittedAt_idx" ON "QuizAttempt"("studentId","submittedAt");
CREATE TABLE "QuizAnswer" ("id" UUID NOT NULL,"attemptId" UUID NOT NULL,"questionId" UUID NOT NULL,"answer" JSONB NOT NULL,"isCorrect" BOOLEAN,"pointsEarned" INTEGER NOT NULL DEFAULT 0,CONSTRAINT "QuizAnswer_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "QuizAnswer_attemptId_questionId_key" ON "QuizAnswer"("attemptId","questionId");

CREATE TABLE "Assignment" ("id" UUID NOT NULL,"lessonId" UUID NOT NULL,"instructions" TEXT NOT NULL,"deadline" TIMESTAMP(3),"maxScore" INTEGER NOT NULL DEFAULT 100,"allowResubmission" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Assignment_lessonId_key" ON "Assignment"("lessonId");
CREATE TABLE "AssignmentSubmission" ("id" UUID NOT NULL,"assignmentId" UUID NOT NULL,"studentId" UUID NOT NULL,"text" TEXT,"storageKey" TEXT,"fileName" TEXT,"mimeType" TEXT,"fileSize" INTEGER,"status" "AssignmentSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',"grade" INTEGER,"feedback" TEXT,"submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"gradedAt" TIMESTAMP(3),CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AssignmentSubmission_assignmentId_studentId_submittedAt_idx" ON "AssignmentSubmission"("assignmentId","studentId","submittedAt");

CREATE TABLE "CourseCertificate" ("id" UUID NOT NULL,"enrollmentId" UUID NOT NULL,"studentId" UUID NOT NULL,"courseId" UUID NOT NULL,"certificateNumber" TEXT NOT NULL,"verificationCode" TEXT NOT NULL,"issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"status" "CertificateStatus" NOT NULL DEFAULT 'ACTIVE',"revokedAt" TIMESTAMP(3),CONSTRAINT "CourseCertificate_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "CourseCertificate_certificateNumber_key" ON "CourseCertificate"("certificateNumber");
CREATE UNIQUE INDEX "CourseCertificate_verificationCode_key" ON "CourseCertificate"("verificationCode");
CREATE UNIQUE INDEX "CourseCertificate_enrollmentId_courseId_key" ON "CourseCertificate"("enrollmentId","courseId");
CREATE INDEX "CourseCertificate_studentId_issuedAt_idx" ON "CourseCertificate"("studentId","issuedAt");
CREATE TABLE "CourseReview" ("id" UUID NOT NULL,"courseId" UUID NOT NULL,"studentId" UUID NOT NULL,"rating" INTEGER NOT NULL,"title" TEXT NOT NULL,"content" TEXT NOT NULL,"status" "CourseReviewStatus" NOT NULL DEFAULT 'ACTIVE',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "CourseReview_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "CourseReview_courseId_studentId_key" ON "CourseReview"("courseId","studentId");
CREATE INDEX "CourseReview_courseId_status_createdAt_idx" ON "CourseReview"("courseId","status","createdAt");

ALTER TABLE "Course" ADD CONSTRAINT "Course_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CourseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseSection" ADD CONSTRAINT "CourseSection_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonResource" ADD CONSTRAINT "LessonResource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CoursePurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseCertificate" ADD CONSTRAINT "CourseCertificate_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseCertificate" ADD CONSTRAINT "CourseCertificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseCertificate" ADD CONSTRAINT "CourseCertificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
