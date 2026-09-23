-- Prisma cannot express range exclusion or these cross-row capacity guarantees.
-- Preserve this migration when evolving the schema. Never replace with db push.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Shift" ADD CONSTRAINT "shift_valid_interval" CHECK ("endAt" > "startAt" AND "endAt" <= "startAt" + interval '24 hours');
ALTER TABLE "Shift" ADD CONSTRAINT "shift_positive_capacity" CHECK (headcount > 0);
ALTER TABLE "Shift" ADD CONSTRAINT "shift_valid_break" CHECK ("breakMinutes" >= 0 AND "breakMinutes" * interval '1 minute' < "endAt" - "startAt");
ALTER TABLE "Shift" ADD CONSTRAINT "shift_nonnegative_money" CHECK ("amountMinor" >= 0 AND currency = 'UZS');
ALTER TABLE "Shift" ADD CONSTRAINT "shift_valid_deadline" CHECK ("applyDeadline" <= "startAt");
ALTER TABLE "Shift" ADD CONSTRAINT "shift_lifecycle" CHECK (status IN ('DRAFT','PUBLISHED','IN_PROGRESS','COMPLETED','CLOSED','CANCELLED'));
ALTER TABLE "Shift" ADD CONSTRAINT "shift_pay_type" CHECK ("payType" IN ('HOURLY','FIXED'));
ALTER TABLE "Availability" ADD CONSTRAINT "availability_valid_interval" CHECK ("endAt" > "startAt");
ALTER TABLE "Assignment" ADD CONSTRAINT "assignment_valid_interval" CHECK ("endAt" > "startAt");
ALTER TABLE "ActiveBooking" ADD CONSTRAINT "active_booking_valid_interval" CHECK ("endAt" > "startAt");
ALTER TABLE "ActiveBooking" ADD CONSTRAINT "worker_no_overlapping_booking" EXCLUDE USING gist ("workerId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&);
CREATE UNIQUE INDEX "assignment_one_active_per_worker_shift" ON "Assignment" ("shiftId", "workerId") WHERE status IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT','COMPLETED');
ALTER TABLE "Timesheet" ADD CONSTRAINT "timesheet_valid_minutes" CHECK ("breakMinutes" >= 0 AND "paidMinutes" >= 0 AND ("endedAt" IS NULL OR "endedAt" >= "startedAt"));
ALTER TABLE "WageRecord" ADD CONSTRAINT "wage_nonnegative_money" CHECK ("amountMinor" >= 0 AND currency = 'UZS');
ALTER TABLE "PlanVersion" ADD CONSTRAINT "plan_valid_limits" CHECK ("priceMinor" >= 0 AND "branchLimit" > 0 AND "memberLimit" > 0 AND "publishLimit" >= 0 AND currency = 'UZS');
ALTER TABLE "Invoice" ADD CONSTRAINT "invoice_nonnegative_money" CHECK ("amountMinor" >= 0 AND currency = 'UZS');
ALTER TABLE "ProviderTransaction" ADD CONSTRAINT "transaction_nonnegative_money" CHECK ("amountMinor" >= 0 AND currency = 'UZS');
ALTER TABLE "Refund" ADD CONSTRAINT "refund_positive_money" CHECK ("amountMinor" > 0);
ALTER TABLE "Review" ADD CONSTRAINT "review_valid_rating" CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE "FileAsset" ADD CONSTRAINT "file_size_limit" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 5242880);
ALTER TABLE "UsageCounter" ADD CONSTRAINT "usage_nonnegative" CHECK ("publishedCount" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "phone_e164" CHECK (phone ~ '^\+[1-9][0-9]{7,14}$');

-- Supplement explicit scalar foreign keys without artificial ORM relation graphs.
ALTER TABLE "WorkerProfile" ADD FOREIGN KEY ("cityId") REFERENCES "City"(id);
ALTER TABLE "Organization" ADD FOREIGN KEY ("cityId") REFERENCES "City"(id);
ALTER TABLE "Branch" ADD FOREIGN KEY ("cityId") REFERENCES "City"(id);
ALTER TABLE "ConsentRecord" ADD FOREIGN KEY ("userId") REFERENCES "User"(id);
ALTER TABLE "MfaCredential" ADD FOREIGN KEY ("userId") REFERENCES "User"(id);
ALTER TABLE "PrivateDocument" ADD FOREIGN KEY ("userId") REFERENCES "User"(id);
ALTER TABLE "PrivateDocument" ADD FOREIGN KEY ("fileId") REFERENCES "FileAsset"(id);
ALTER TABLE "FileAsset" ADD FOREIGN KEY ("ownerId") REFERENCES "User"(id);
ALTER TABLE "FileAsset" ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"(id);
ALTER TABLE "OrganizationMembership" ADD FOREIGN KEY ("customRoleId", "organizationId") REFERENCES "OrganizationRole"(id,"organizationId");
ALTER TABLE "TeamInvitation" ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"(id);
ALTER TABLE "TeamInvitation" ADD FOREIGN KEY ("createdById") REFERENCES "User"(id);
ALTER TABLE "TeamInvitation" ADD FOREIGN KEY ("customRoleId", "organizationId") REFERENCES "OrganizationRole"(id,"organizationId");
ALTER TABLE "ShiftOffer" ADD FOREIGN KEY ("workerId") REFERENCES "User"(id);
ALTER TABLE "ShiftOffer" ADD FOREIGN KEY ("createdById") REFERENCES "User"(id);
ALTER TABLE "ShiftOffer" ADD FOREIGN KEY ("shiftId","organizationId") REFERENCES "Shift"(id,"organizationId");
ALTER TABLE "Assignment" ADD FOREIGN KEY ("offerId") REFERENCES "ShiftOffer"(id);
ALTER TABLE "AttendanceToken" ADD FOREIGN KEY ("assignmentId","organizationId") REFERENCES "Assignment"(id,"organizationId");
ALTER TABLE "AttendanceEvent" ADD FOREIGN KEY ("assignmentId","organizationId") REFERENCES "Assignment"(id,"organizationId");
ALTER TABLE "Review" ADD FOREIGN KEY ("assignmentId","organizationId") REFERENCES "Assignment"(id,"organizationId");
ALTER TABLE "Dispute" ADD FOREIGN KEY ("assignmentId","organizationId") REFERENCES "Assignment"(id,"organizationId");
ALTER TABLE "Conversation" ADD FOREIGN KEY ("assignmentId","organizationId") REFERENCES "Assignment"(id,"organizationId");
ALTER TABLE "ConversationParticipant" ADD FOREIGN KEY ("userId") REFERENCES "User"(id);
ALTER TABLE "Message" ADD FOREIGN KEY ("senderId") REFERENCES "User"(id);
ALTER TABLE "Notification" ADD FOREIGN KEY ("userId") REFERENCES "User"(id);
ALTER TABLE "NotificationPreference" ADD FOREIGN KEY ("userId") REFERENCES "User"(id);
ALTER TABLE "SupportTicket" ADD FOREIGN KEY ("userId") REFERENCES "User"(id);
ALTER TABLE "ApiCredential" ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"(id);
ALTER TABLE "ApiCredential" ADD FOREIGN KEY ("createdById") REFERENCES "User"(id);
ALTER TABLE "SavedShift" ADD FOREIGN KEY ("userId") REFERENCES "User"(id);
ALTER TABLE "SavedShift" ADD FOREIGN KEY ("shiftId") REFERENCES "Shift"(id);
ALTER TABLE "WageRecord" ADD FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"(id);

ALTER TABLE "Subscription" ADD CONSTRAINT "subscription_id_tenant" UNIQUE (id,"organizationId");
ALTER TABLE "Invoice" ADD CONSTRAINT "invoice_id_tenant" UNIQUE (id,"organizationId");
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "attempt_id_invoice_tenant" UNIQUE (id,"invoiceId","organizationId");
ALTER TABLE "ProviderTransaction" ADD CONSTRAINT "transaction_id_invoice_tenant" UNIQUE (id,"invoiceId","organizationId");
ALTER TABLE "Invoice" ADD FOREIGN KEY ("subscriptionId","organizationId") REFERENCES "Subscription"(id,"organizationId");
ALTER TABLE "Entitlement" ADD FOREIGN KEY ("subscriptionId","organizationId") REFERENCES "Subscription"(id,"organizationId");
ALTER TABLE "PaymentAttempt" ADD FOREIGN KEY ("invoiceId","organizationId") REFERENCES "Invoice"(id,"organizationId");
ALTER TABLE "ProviderTransaction" ADD FOREIGN KEY ("paymentAttemptId","invoiceId","organizationId") REFERENCES "PaymentAttempt"(id,"invoiceId","organizationId");
ALTER TABLE "Refund" ADD FOREIGN KEY ("transactionId","invoiceId","organizationId") REFERENCES "ProviderTransaction"(id,"invoiceId","organizationId");
ALTER TABLE "ReconciliationCase" ADD FOREIGN KEY ("invoiceId","organizationId") REFERENCES "Invoice"(id,"organizationId");

CREATE OR REPLACE FUNCTION enforce_booking_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE places integer;
BEGIN
  SELECT headcount INTO places FROM "Shift" WHERE id=NEW."shiftId" FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM "Assignment" WHERE id=NEW."assignmentId" AND "organizationId"=NEW."organizationId" AND "shiftId"=NEW."shiftId" AND "workerId"=NEW."workerId" AND "startAt"=NEW."startAt" AND "endAt"=NEW."endAt") THEN
    RAISE EXCEPTION 'booking must match assignment' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM "ActiveBooking" WHERE "shiftId"=NEW."shiftId" AND id<>NEW.id) >= places THEN
    RAISE EXCEPTION 'shift capacity exceeded' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "booking_capacity" BEFORE INSERT OR UPDATE ON "ActiveBooking" FOR EACH ROW EXECUTE FUNCTION enforce_booking_capacity();

CREATE OR REPLACE FUNCTION protect_confirmed_shift_terms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE confirmed integer;
BEGIN
  SELECT count(*) INTO confirmed FROM "Assignment" WHERE "shiftId"=NEW.id AND status IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT','COMPLETED');
  IF NEW.headcount < confirmed THEN RAISE EXCEPTION 'headcount below confirmed workers' USING ERRCODE='23514'; END IF;
  IF confirmed > 0 AND (NEW."startAt",NEW."endAt",NEW."branchId",NEW."amountMinor",NEW."payType",NEW."breakMinutes",NEW."paidBreak") IS DISTINCT FROM (OLD."startAt",OLD."endAt",OLD."branchId",OLD."amountMinor",OLD."payType",OLD."breakMinutes",OLD."paidBreak") THEN
    RAISE EXCEPTION 'confirmed terms immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "confirmed_shift_terms" BEFORE UPDATE ON "Shift" FOR EACH ROW EXECUTE FUNCTION protect_confirmed_shift_terms();

CREATE INDEX "offer_expiry_jobs" ON "ShiftOffer" ("expiresAt") WHERE status='PENDING';
CREATE INDEX "outbox_unprocessed" ON "OutboxEvent" ("availableAt","createdAt") WHERE "processedAt" IS NULL;
CREATE INDEX "message_unread_lookup" ON "Message" ("conversationId","createdAt","senderId");
CREATE INDEX "pending_payment_reconciliation" ON "PaymentAttempt" ("createdAt") WHERE status='PENDING';
