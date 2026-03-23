export interface ChannelStripState {
  trackId: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  peakDb: number;
}

export interface MasterBusState {
  volume: number;
  pan: number;
  peakDb: number;
}
