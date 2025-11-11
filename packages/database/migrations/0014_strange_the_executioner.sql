ALTER TABLE "task_folders" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "task_folders" ADD COLUMN "is_expanded" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "task_folders" ADD CONSTRAINT "task_folders_parent_id_task_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."task_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_folders_parent_id_idx" ON "task_folders" USING btree ("parent_id");