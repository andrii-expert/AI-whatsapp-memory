ALTER TABLE "tasks" DROP CONSTRAINT "tasks_folder_id_task_folders_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_folder_id_task_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."task_folders"("id") ON DELETE cascade ON UPDATE no action;