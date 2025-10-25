export const VOICE_STAGE_SEQUENCE: Record<string, number> = {
  webhook_received: 5,
  audio_download: 10,
  transcription: 20,
  intent_analysis: 25,
  intent_build_context: 30,
  intent_request: 40,
  clarification_dispatch: 50,
  clarification_response: 55,
  event_create: 60,
  event_update: 70,
  event_delete: 80,
  notification_send: 90,
};
