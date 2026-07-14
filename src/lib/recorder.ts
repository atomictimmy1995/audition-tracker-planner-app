/**
 * In-app recorder (spec §3.4): tap record → tag excerpt → auto-filed to that
 * excerpt's card. Local-first: the take always lands on disk via expo-audio;
 * upload to Supabase storage happens after, and failure leaves a local take
 * (background sync is phase 2 polish).
 */

import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';

import { supabase } from './supabase';

export function useTakeRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);

  async function start(): Promise<void> {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error('Microphone permission is required to record takes.');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  /** Stops and returns the local file URI. */
  async function stop(): Promise<string> {
    await recorder.stop();
    if (!recorder.uri) throw new Error('Recording produced no file.');
    return recorder.uri;
  }

  return { start, stop, isRecording: state.isRecording, durationMillis: state.durationMillis };
}

export interface FiledTake {
  fileUrl: string;
  takeNumber: number;
}

/** Upload a take and file it to an excerpt card (or a mock session). */
export async function fileTake(opts: {
  userId: string;
  localUri: string;
  excerptCardId?: string;
  mockSessionId?: string;
  durationSecs?: number;
}): Promise<FiledTake> {
  const { count } = await supabase
    .from('recordings')
    .select('id', { count: 'exact', head: true })
    .eq(
      opts.excerptCardId ? 'excerpt_card_id' : 'mock_session_id',
      opts.excerptCardId ?? opts.mockSessionId!,
    );
  const takeNumber = (count ?? 0) + 1;

  const path = `${opts.userId}/${Date.now()}-take${takeNumber}.m4a`;
  const bytes = await new File(opts.localUri).bytes();
  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(path, bytes, { contentType: 'audio/m4a' });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('recordings').insert({
    user_id: opts.userId,
    excerpt_card_id: opts.excerptCardId ?? null,
    mock_session_id: opts.mockSessionId ?? null,
    file_url: path,
    duration_secs: opts.durationSecs ?? null,
    take_number: takeNumber,
  });
  if (error) throw error;

  return { fileUrl: path, takeNumber };
}

/**
 * Signed, time-limited URL for playing a stored take. The bucket is private
 * (RLS keys paths by user id), so playback goes through a signed URL rather
 * than a public link.
 */
export async function signedRecordingUrl(filePath: string, expiresInSecs = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from('recordings')
    .createSignedUrl(filePath, expiresInSecs);
  if (error || !data) throw error ?? new Error('Could not sign recording URL.');
  return data.signedUrl;
}
