ALTER TABLE "payments" ADD COLUMN "payfast_m_payment_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_payfast_m_payment_idx" ON "payments" USING btree ("payfast_m_payment_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payfast_m_payment_id_unique" UNIQUE("payfast_m_payment_id");