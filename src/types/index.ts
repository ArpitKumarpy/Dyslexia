export interface ReaderSettings {
  fontFamily: string;
  fontSize: number;
  lineSpacing: number;
  letterSpacing: number;
  fontWeight: number;
  backgroundColor: string;
  textColor: string;
  headTrackingSensitivity: number;
  irisTrackingSensitivity: number;
  trackingSteadiness: number;
  trackingNeutralLineHeight: number;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}
