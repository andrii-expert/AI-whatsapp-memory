"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@imaginecalendar/ui/card";
import { Button } from "@imaginecalendar/ui/button";
import { Badge } from "@imaginecalendar/ui/badge";
import {
  Loader2,
  RefreshCw,
  Trash2,
  MessageCircle,
  Reply,
  AlertCircle,
  Calendar,
  Mic,
  FileText,
} from "lucide-react";

type VoiceJob = {
  id: string;
  intentJobId: string | null;
  status: string;
  clarificationStatus?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  transcribedText?: string | null;
  transcriptionLanguage?: string | null;
  sttProvider?: string | null;
  audioDurationSeconds?: number | null;
  audioFileSizeBytes?: number | null;
  audioFilePath?: string | null;
  mediaId?: string | null;
  mimeType?: string | null;
  calendarEventId?: string | null;
  calendarProvider?: string | null;
  intentSnapshot?: unknown;
  intentAnalysis?: unknown;
  intentProvider?: string | null;
  senderPhone?: string | null;
  [key: string]: any;
};

type JobGroup = {
  intentJobId: string;
  jobs: VoiceJob[];
  latestJob: VoiceJob;
};

type PendingIntentRecord = {
  id: string;
  status: string;
  clarificationPlan?: unknown;
  expiresAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  [key: string]: any;
};

type InteractivePromptRecord = {
  id: string;
  fieldKey: string;
  responseReceived: boolean;
  selectedValue?: string | null;
  options: unknown;
  whatsappMessageId?: string | null;
  createdAt: string | Date;
  [key: string]: any;
};

type FlowSessionRecord = {
  flowToken: string;
  responseReceived: boolean;
  responseData?: unknown;
  fieldsRequested: unknown;
  createdAt: string | Date;
  [key: string]: any;
};

type IntentSnapshot = {
  action?: string;
  confidence?: number;
  title?: string;
  datetime?: { iso?: string } | string | null;
  location?: { value?: string } | string | null;
  durationMinutes?: number;
  attendees?: any[];
  followUp?: any[];
  conflict?: { summary?: string } | null;
  [key: string]: any;
};

type ClarificationPromptEntry = {
  field: string;
  channel?: string;
  question?: string;
  createdAt?: string;
  options?: Array<{ id: string; label: string; value: string }>;
};

type ClarificationPlan = {
  pendingFields?: string[];
  prompts?: ClarificationPromptEntry[] | null;
  responses?: Record<string, {
    value: string;
    label?: string;
    source?: string;
    respondedAt?: string | Date | null;
  }> | null;
  reminderSentAt?: string | Date | null;
  expiredAt?: string | Date | null;
};

type ClarificationTimelineEntry = {
  id: string;
  kind: "prompt" | "response" | "system";
  field?: string;
  channel?: string;
  question?: string;
  value?: string;
  note?: string;
  timestamp?: string | Date | null;
  order: number;
};

type VoiceJobTimingRecord = {
  id?: string;
  stage: string;
  stageGroup?: string | null;
  sequence?: number | null;
  startedAt: string | Date;
  completedAt?: string | Date | null;
  durationMs?: number | null;
  metadata?: Record<string, any> | null;
};

type TimingSummary = {
  stages: Record<string, {
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
  }>;
  stageOrder: string[];
  totalDurationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
};

type IntentPayloadRecord = {
  id: string;
  sequence: number;
  payloadType: string;
  provider?: string | null;
  metadata?: Record<string, any> | null;
  payload: any;
  createdAt: string | Date;
};

const DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "transcription", label: "Transcription" },
  { id: "intent", label: "AI Intent" },
  { id: "clarifications", label: "Clarifications" },
  { id: "timing", label: "Timing Metrics" },
  { id: "payloads", label: "AI Payloads" },
  { id: "calendar", label: "Calendar Outcome" },
  { id: "raw", label: "Raw JSON" },
] as const;

type DetailTab = (typeof DETAIL_TABS)[number]["id"];

const TIMEZONE = "Africa/Johannesburg";

export default function VoiceTestingPage() {
  const trpc = useTRPC();

  const {
    data: testJobsData,
    isLoading: jobsLoading,
    isFetching: jobsFetching,
    refetch: refetchJobs,
  } = useQuery({
    ...trpc.voiceTesting.getTestJobs.queryOptions({ includeAll: true }),
  });
  const testJobs = testJobsData ?? [];

  const [selectedIntentJobId, setSelectedIntentJobId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  const groupedJobs = useMemo<JobGroup[]>(() => {
    if (!Array.isArray(testJobs)) {
      return [];
    }

    const groups = new Map<string, VoiceJob[]>();
    for (const rawJob of testJobs as unknown[]) {
      const job = rawJob as VoiceJob;
      const key = job.intentJobId ?? job.id;
      const existing = groups.get(key);
      if (existing) {
        existing.push(job);
      } else {
        groups.set(key, [job]);
      }
    }

    const result: JobGroup[] = [];
    for (const [intentJobId, jobsForIntent] of groups.entries()) {
      const sorted = [...jobsForIntent].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      if (!sorted.length) {
        continue;
      }
      const latestJob = sorted[0]!;
      result.push({ intentJobId, jobs: sorted, latestJob });
    }

    return result.sort(
      (a, b) => new Date(b.latestJob.createdAt).getTime() - new Date(a.latestJob.createdAt).getTime()
    );
  }, [testJobs]);

  useEffect(() => {
    const first = groupedJobs[0];
    if (!selectedIntentJobId && first) {
      setSelectedIntentJobId(first.intentJobId);
      setSelectedJobId(first.latestJob.id);
    }
  }, [groupedJobs, selectedIntentJobId]);

  useEffect(() => {
    if (!selectedIntentJobId) {
      return;
    }
    const match = groupedJobs.find((group) => group.intentJobId === selectedIntentJobId);
    if (match && match.latestJob.id !== selectedJobId) {
      setSelectedJobId(match.latestJob.id);
    }
  }, [groupedJobs, selectedIntentJobId, selectedJobId]);

  useEffect(() => {
    setActiveTab("overview");
  }, [selectedJobId]);

  const {
    data: jobDetails,
    isLoading: jobDetailsLoading,
    isFetching: jobDetailsFetching,
    refetch: refetchJobDetails,
  } = useQuery({
    ...trpc.voiceTesting.getJobStatus.queryOptions({ jobId: selectedJobId ?? "" }),
    enabled: !!selectedJobId,
    refetchInterval: 2000,
  });

  const cleanupJobs = useMutation(
    trpc.voiceTesting.cleanupTestJobs.mutationOptions({
      onSuccess: () => {
        setSelectedIntentJobId(null);
        setSelectedJobId(null);
        refetchJobs();
      },
    })
  );

  const handleSelectGroup = (intentJobId: string, voiceJobId: string) => {
    setSelectedIntentJobId(intentJobId);
    setSelectedJobId(voiceJobId);
  };

  const handleRefresh = () => {
    refetchJobs();
    if (selectedJobId) {
      refetchJobDetails();
    }
  };

  if (jobsLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const selectedGroup = groupedJobs.find((group) => group.intentJobId === selectedIntentJobId) ?? null;
  const job = jobDetails?.job as VoiceJob | undefined;
  const pendingIntent = (jobDetails?.pendingIntent ?? null) as PendingIntentRecord | null;
  const interactivePromptRecords = (jobDetails?.interactivePrompts ?? []) as unknown as InteractivePromptRecord[];
  const flowSessionRecords = (jobDetails?.flowSessions ?? []) as unknown as FlowSessionRecord[];
  const timingRecords = (jobDetails?.timings ?? []) as VoiceJobTimingRecord[];
  const timingSummary = (jobDetails?.timingSummary ?? null) as TimingSummary | null;
  const intentPayloadRecords = (jobDetails?.intentPayloads ?? []) as IntentPayloadRecord[];
  const clarificationPlan = parseClarificationPlan(pendingIntent?.clarificationPlan);
  const clarificationTimeline = buildClarificationTimeline(
    clarificationPlan,
    pendingIntent,
    interactivePromptRecords,
    flowSessionRecords
  );
  const outstandingFields = clarificationPlan?.pendingFields ?? [];
  const intentSnapshot: IntentSnapshot | null = parseIntentSnapshot(
    job?.intentSnapshot ?? job?.intentAnalysis
  );
  const intentLocation = intentSnapshot?.location
    ? typeof intentSnapshot.location === "string"
      ? intentSnapshot.location
      : intentSnapshot.location?.value ?? "—"
    : "—";

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Intent Pipeline Debugger</h1>
          <p className="text-muted-foreground">
            Inspect voice and text jobs grouped by intent ID. All timestamps are shown in Africa/Johannesburg (GMT+2).
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Showing all voice jobs. Cleanup will remove ALL jobs for your account.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={jobsFetching || jobDetailsFetching}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            onClick={() => cleanupJobs.mutate()}
            variant="destructive"
            size="sm"
            disabled={cleanupJobs.isPending}
            title="Deletes ALL voice jobs for your account"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Cleanup All Jobs
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Intent Jobs ({groupedJobs.length})</h2>
            {jobsFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="mt-4 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "640px" }}>
            {groupedJobs.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No jobs found. Send a WhatsApp voice note or text message to see it appear here for debugging.
              </div>
            )}
            {groupedJobs.map((group) => {
              const latest = group.latestJob;
              const source = deriveJobSource(latest);
              const isSelected = selectedIntentJobId === group.intentJobId;

              return (
                <button
                  key={group.intentJobId}
                  onClick={() => handleSelectGroup(group.intentJobId, latest.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {group.intentJobId.slice(0, 8)}…
                      </span>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <JobStatusBadge status={latest.status} />
                        {latest.clarificationStatus && (
                          <Badge variant="outline" className="text-[11px] capitalize">
                            {formatStatusLabel(latest.clarificationStatus)}
                          </Badge>
                        )}
                        <Badge variant="outline" className="flex items-center gap-1 text-[11px]">
                          {source === "text" ? <FileText className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                          {source === "text" ? "Text" : "Voice"}
                        </Badge>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(latest.updatedAt ?? latest.createdAt)}
                    </span>
                  </div>
                  {latest.transcribedText && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {latest.transcribedText}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[11px]">
                      Jobs: {group.jobs.length}
                    </Badge>
                    {latest.intentProvider && (
                      <Badge variant="outline" className="text-[11px]">
                        AI: {latest.intentProvider}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          {!selectedGroup || !selectedJobId ? (
            <div className="flex h-80 items-center justify-center text-muted-foreground">
              Select an intent job to see full details
            </div>
          ) : jobDetailsLoading && !job ? (
            <div className="flex h-80 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : job ? (
            <div className="space-y-6">
              <header className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <JobStatusBadge status={job.status} />
                  {job.clarificationStatus && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {formatStatusLabel(job.clarificationStatus)}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    Intent Job: {selectedGroup.intentJobId}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Voice Job: {job.id}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Updated {formatTimestamp(job.updatedAt ?? job.createdAt)} · Source: {deriveJobSource(job) === "text" ? "Text command" : "Voice note"}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  All times Africa/Johannesburg (GMT+2)
                </div>
              </header>

              <nav className="flex flex-wrap gap-2">
                {DETAIL_TABS.map((tab) => (
                  <Button
                    key={tab.id}
                    size="sm"
                    variant={activeTab === tab.id ? "default" : "outline"}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </Button>
                ))}
              </nav>

              {activeTab === "overview" && (
                <section className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoRow label="Intent Job ID" value={selectedGroup.intentJobId} />
                    <InfoRow label="Voice Job ID" value={job.id} />
                    <InfoRow label="Current Status" value={formatStatusLabel(job.status)} />
                    <InfoRow label="Clarification Status" value={job.clarificationStatus ? formatStatusLabel(job.clarificationStatus) : "—"} />
                    <InfoRow label="Created" value={formatTimestamp(job.createdAt)} />
                    <InfoRow label="Updated" value={formatTimestamp(job.updatedAt)} />
                    <InfoRow label="Outstanding Fields" value={outstandingFields.length ? outstandingFields.join(", ") : "None"} />
                    <InfoRow
                      label="Pending Intent State"
                      value={pendingIntent?.status ? formatStatusLabel(pendingIntent.status) : "—"}
                      hint={pendingIntent?.expiresAt ? `Expires ${formatRelative(pendingIntent.expiresAt)}` : undefined}
                    />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">Job History</h3>
                    <JobHistoryList jobs={selectedGroup.jobs} />
                  </div>
                </section>
              )}

              {activeTab === "transcription" && (
                <section className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <InfoRow label="Provider" value={job.sttProvider || "—"} />
                    <InfoRow label="Language" value={job.transcriptionLanguage || "—"} />
                    <InfoRow label="Audio Duration" value={describeDuration(job.audioDurationSeconds)} />
                    <InfoRow label="File Size" value={describeSize(job.audioFileSizeBytes)} />
                    <InfoRow label="Audio Path" value={job.audioFilePath || "—"} className="md:col-span-2" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Transcript</h3>
                    <pre className="mt-2 max-h-[280px] overflow-auto rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">
                      {job.transcribedText || "No transcription captured."}
                    </pre>
                  </div>
                </section>
              )}

              {activeTab === "intent" && (
                <section className="space-y-4">
                  {intentSnapshot ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoRow label="Action" value={intentSnapshot?.action || "—"} />
                      <InfoRow label="Confidence" value={formatConfidence(intentSnapshot?.confidence)} />
                      <InfoRow label="Title" value={intentSnapshot?.title || "—"} />
                      <InfoRow label="Datetime" value={formatIntentDatetime(intentSnapshot)} hint="Stored in GMT+2" />
                      <InfoRow label="Location" value={intentLocation} />
                      <InfoRow label="Duration" value={intentSnapshot?.durationMinutes ? `${intentSnapshot.durationMinutes} min` : "—"} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No intent snapshot recorded for this job.</p>
                  )}

                  {intentSnapshot?.attendees && intentSnapshot.attendees.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold">Attendees</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                        {intentSnapshot.attendees.map((attendee: any, index: number) => (
                          <li key={index}>{attendee.email || attendee.name || attendee}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {intentSnapshot?.followUp && intentSnapshot.followUp.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold">Follow-up Questions</h3>
                      <div className="mt-2 grid gap-3 md:grid-cols-2">
                        {intentSnapshot.followUp.map((item: any, index: number) => (
                          <div key={`${item.field}-${index}`} className="rounded-lg border p-3">
                            <p className="text-xs font-medium text-muted-foreground uppercase">{item.field}</p>
                            <p className="mt-2 text-sm">{item.question}</p>
                            {item.options && item.options.length > 0 && (
                              <p className="mt-2 text-xs text-muted-foreground">Options: {item.options.join(", ")}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {activeTab === "clarifications" && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Status: {pendingIntent?.status ? formatStatusLabel(pendingIntent.status) : "None"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Pending Fields: {outstandingFields.length}
                    </Badge>
                    {pendingIntent?.expiresAt && (
                      <Badge variant="outline" className="text-xs">
                        Expires {formatRelative(pendingIntent.expiresAt)}
                      </Badge>
                    )}
                  </div>

                  {clarificationTimeline.length > 0 ? (
                    <ClarificationTimeline entries={clarificationTimeline} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No clarification history recorded for this job.
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Clarification reminders and timeout messages are currently disabled in this environment.
                  </p>
                </section>
              )}

              {activeTab === "timing" && (
                <section className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <InfoRow
                      label="Total Duration"
                      value={formatDurationFromSummary(timingSummary)}
                    />
                    <InfoRow
                      label="Started"
                      value={timingSummary?.startedAt ? formatTimestamp(timingSummary.startedAt) : "—"}
                    />
                    <InfoRow
                      label="Completed"
                      value={timingSummary?.completedAt ? formatTimestamp(timingSummary.completedAt) : "—"}
                    />
                  </div>

                  <TimingStageList timings={timingRecords} />
                </section>
              )}

              {activeTab === "payloads" && (
                <section className="space-y-4">
                  <PayloadList payloads={intentPayloadRecords} />
                </section>
              )}

              {activeTab === "calendar" && (
                <section className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoRow label="Calendar Event ID" value={job.calendarEventId || "—"} />
                    <InfoRow label="Provider" value={job.calendarProvider || "—"} />
                    <InfoRow label="Operation" value={intentSnapshot?.action || "—"} />
                    <InfoRow label="Job Status" value={formatStatusLabel(job.status)} />
                  </div>

                  {intentSnapshot?.conflict && intentSnapshot.conflict?.summary && (
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Conflict</p>
                      <p className="mt-2 text-sm">{intentSnapshot.conflict.summary}</p>
                    </div>
                  )}

                  {!job.calendarEventId && job.status !== "completed" && (
                    <p className="text-sm text-muted-foreground">
                      No calendar event recorded yet. The job may still be processing or awaiting clarification.
                    </p>
                  )}
                </section>
              )}

              {activeTab === "raw" && (
                <section>
                  <pre className="max-h-[420px] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs">
                    {JSON.stringify(jobDetails, null, 2)}
                  </pre>
                </section>
              )}
            </div>
          ) : (
            <div className="flex h-80 items-center justify-center text-muted-foreground">
              Job details unavailable.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variantMap: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    pending: "outline",
    downloading: "secondary",
    transcribing: "secondary",
    transcribed: "secondary",
    analyzing: "secondary",
    processing_intent: "secondary",
    intent_ready: "outline",
    awaiting_clarification: "secondary",
    clarification_timeout: "destructive",
    awaiting_verification: "outline",
    creating_event: "secondary",
    updating_event: "secondary",
    deleting_event: "secondary",
    completed: "default",
    failed: "destructive",
  };

  const variant =
    variantMap[normalized] ||
    (normalized.startsWith("paused") ? "outline" : "secondary");

  return (
    <Badge variant={variant} className="text-xs capitalize">
      {formatStatusLabel(status)}
    </Badge>
  );
}

function InfoRow({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number | ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${className ?? ""}`}>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{value ?? "—"}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function JobHistoryList({ jobs }: { jobs: VoiceJob[] }) {
  return (
    <div className="mt-2 space-y-2">
      {jobs.map((job) => (
        <div key={job.id} className="flex items-center justify-between rounded-lg border p-2">
          <div className="flex items-center gap-2">
            <JobStatusBadge status={job.status} />
            <span className="font-mono text-xs text-muted-foreground">{job.id.slice(0, 8)}…</span>
          </div>
          <span className="text-xs text-muted-foreground">{formatTimestamp(job.updatedAt ?? job.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function ClarificationTimeline({ entries }: { entries: ClarificationTimelineEntry[] }) {
  return (
    <div className="space-y-4">
      {entries.map((entry) => {
        const Icon = entry.kind === "prompt" ? MessageCircle : entry.kind === "response" ? Reply : AlertCircle;
        const variant = entry.kind === "prompt" ? "secondary" : entry.kind === "response" ? "default" : "outline";

        return (
          <div key={entry.id} className="flex gap-3">
            <div className="mt-1">
              <Icon className={`h-4 w-4 ${entry.kind === "system" ? "text-muted-foreground" : "text-primary"}`} />
            </div>
            <div className="flex-1 border-l pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={variant} className="text-xs capitalize">
                  {entry.kind}
                </Badge>
                {entry.field && (
                  <span className="font-mono text-xs text-muted-foreground">{entry.field}</span>
                )}
                {entry.channel && entry.channel !== "flow" && (
                  <Badge variant="outline" className="text-[11px] capitalize">
                    {entry.channel}
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
              {entry.question && <p className="mt-2 text-sm">{entry.question}</p>}
              {entry.value && (
                <pre className="mt-2 whitespace-pre-wrap rounded bg-muted/30 p-2 text-sm">
                  {entry.value}
                </pre>
              )}
              {entry.note && <p className="mt-2 text-xs text-muted-foreground">{entry.note}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function parseClarificationPlan(value: unknown): ClarificationPlan | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as ClarificationPlan;
    } catch {
      return null;
    }
  }

  if (typeof value === "object") {
    return value as ClarificationPlan;
  }

  return null;
}

function parseIntentSnapshot(value: unknown): IntentSnapshot | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as IntentSnapshot;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    return value as IntentSnapshot;
  }
  return null;
}

function buildClarificationTimeline(
  plan: ClarificationPlan | null,
  pendingIntent: PendingIntentRecord | null,
  interactivePrompts: InteractivePromptRecord[],
  flowSessions: FlowSessionRecord[]
): ClarificationTimelineEntry[] {
  const entries: ClarificationTimelineEntry[] = [];
  let order = 0;

  plan?.prompts?.forEach((prompt, index) => {
    const optionCount = Array.isArray(prompt.options) ? prompt.options.length : 0;
    entries.push({
      id: `prompt-${prompt.field}-${index}`,
      kind: "prompt",
      field: prompt.field,
      channel: prompt.channel,
      question: prompt.question,
      note: optionCount ? `${optionCount} options provided` : undefined,
      timestamp: prompt.createdAt ?? null,
      order: order++,
    });
  });

  if (plan?.responses) {
    Object.entries(plan.responses).forEach(([field, response]) => {
      entries.push({
        id: `response-${field}-${order}`,
        kind: "response",
        field,
        channel: response.source ?? "text",
        value: response.label ?? response.value,
        timestamp: response.respondedAt ?? null,
        order: order++,
      });
    });
  }

  interactivePrompts.forEach((prompt) => {
    const optionCount = Array.isArray(prompt.options) ? prompt.options.length : 0;

    if (!prompt.responseReceived) {
      entries.push({
        id: `interactive-${prompt.id}`,
        kind: "prompt",
        field: prompt.fieldKey,
        channel: "interactive",
        note: optionCount ? `${optionCount} options persisted` : undefined,
        timestamp: prompt.createdAt,
        order: order++,
      });
    } else if (prompt.selectedValue) {
      entries.push({
        id: `interactive-response-${prompt.id}`,
        kind: "response",
        field: prompt.fieldKey,
        channel: "interactive",
        value: prompt.selectedValue,
        timestamp: prompt.createdAt,
        order: order++,
      });
    }
  });

  flowSessions.forEach((session) => {
    entries.push({
      id: `flow-${session.flowToken}`,
      kind: session.responseReceived ? "response" : "prompt",
      field: "flow",
      channel: "flow",
      value: session.responseReceived ? JSON.stringify(session.responseData, null, 2) : undefined,
      note: session.responseReceived ? "Flow response captured" : "Flow prompt dispatched",
      timestamp: session.createdAt,
      order: order++,
    });
  });

  if (plan?.reminderSentAt) {
    entries.push({
      id: "reminder",
      kind: "system",
      note: "Reminder triggered (legacy behaviour)",
      timestamp: plan.reminderSentAt,
      order: order++,
    });
  }

  if (plan?.expiredAt) {
    entries.push({
      id: "expired",
      kind: "system",
      note: "Clarification expired",
      timestamp: plan.expiredAt,
      order: order++,
    });
  }

  if (pendingIntent?.status === "awaiting_clarification") {
    entries.push({
      id: "awaiting",
      kind: "system",
      note: "Awaiting user clarification",
      timestamp: pendingIntent.updatedAt ?? pendingIntent.createdAt ?? null,
      order: order++,
    });
  }

  return entries.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    if (ta === tb) {
      return a.order - b.order;
    }
    return ta - tb;
  });
}

function deriveJobSource(job: VoiceJob): "voice" | "text" {
  if (typeof job.mediaId === "string" && job.mediaId.startsWith("text-")) {
    return "text";
  }
  if (job.mimeType === "text/plain") {
    return "text";
  }
  return "voice";
}

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(value?: string | Date | null): string {
  if (!value) {
    return "—";
  }
  try {
    return new Date(value).toLocaleString("en-ZA", {
      timeZone: TIMEZONE,
      hour12: false,
    });
  } catch {
    return String(value);
  }
}

function formatRelative(value?: string | Date | null): string {
  if (!value) {
    return "—";
  }
  const target = new Date(value).getTime();
  const now = Date.now();
  if (Number.isNaN(target)) {
    return formatTimestamp(value);
  }
  const diffMinutes = Math.round((target - now) / 60000);
  if (diffMinutes === 0) {
    return "now";
  }
  return diffMinutes > 0 ? `in ${diffMinutes} min` : `${Math.abs(diffMinutes)} min ago`;
}

function describeDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) {
    return "—";
  }
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (!minutes) {
    return `${remainingSeconds}s`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

function describeSize(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) {
    return "—";
  }
  if (bytes === 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatConfidence(value?: number): string {
  if (value === undefined || value === null) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatIntentDatetime(snapshot: any): string {
  const raw = snapshot?.datetime?.iso ?? snapshot?.datetime ?? snapshot?.start;
  if (!raw) {
    return "—";
  }
  try {
    const dateValue = typeof raw === "string" || raw instanceof Date ? new Date(raw) : new Date(String(raw));
    if (Number.isNaN(dateValue.getTime())) {
      return String(raw);
    }
    return dateValue.toLocaleString("en-ZA", {
      timeZone: TIMEZONE,
      hour12: false,
    });
  } catch {
    return String(raw);
  }
}

function formatStageLabel(stage: string): string {
  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDurationMs(value?: number | null): string {
  if (value === undefined || value === null) {
    return "—";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

function formatDurationFromSummary(summary: TimingSummary | null): string {
  if (!summary || summary.totalDurationMs === null) {
    return "—";
  }
  return formatDurationMs(summary.totalDurationMs);
}

function TimingStageList({ timings }: { timings: VoiceJobTimingRecord[] }) {
  if (!timings.length) {
    return <p className="text-sm text-muted-foreground">No timing data recorded for this job yet.</p>;
  }

  const sorted = [...timings].sort((a, b) => {
    const seqDiff = (a.sequence ?? 0) - (b.sequence ?? 0);
    if (seqDiff !== 0) {
      return seqDiff;
    }
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
  });

  return (
    <div className="space-y-3">
      {sorted.map((timing) => (
        <div key={timing.id ?? `${timing.stage}-${timing.startedAt}`} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {formatStageLabel(timing.stage)}
            </Badge>
            {typeof timing.sequence === "number" && (
              <span className="text-xs text-muted-foreground">Step {timing.sequence}</span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {formatTimestamp(timing.startedAt)}
            </span>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <InfoRow label="Duration" value={formatDurationMs(timing.durationMs)} />
            <InfoRow label="Started" value={formatTimestamp(timing.startedAt)} />
            <InfoRow label="Completed" value={timing.completedAt ? formatTimestamp(timing.completedAt) : "—"} />
          </div>
          {timing.metadata && Object.keys(timing.metadata).length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground">Metadata</p>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/30 p-2 text-xs">
                {JSON.stringify(timing.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PayloadList({ payloads }: { payloads: IntentPayloadRecord[] }) {
  if (!payloads.length) {
    return <p className="text-sm text-muted-foreground">No AI payloads recorded for this job.</p>;
  }

  const sorted = [...payloads].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="space-y-3">
      {sorted.map((payload) => (
        <div key={payload.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs uppercase">
              {payload.payloadType}
            </Badge>
            <span className="text-xs text-muted-foreground">Sequence {payload.sequence}</span>
            {payload.provider && (
              <Badge variant="outline" className="text-[11px]">
                {payload.provider}
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {formatTimestamp(payload.createdAt)}
            </span>
          </div>
          {payload.metadata && Object.keys(payload.metadata).length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground">Metadata</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/30 p-2 text-xs">
                {JSON.stringify(payload.metadata, null, 2)}
              </pre>
            </div>
          )}
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground">Payload</p>
            <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted/30 p-2 text-xs">
              {JSON.stringify(payload.payload, null, 2)}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}
