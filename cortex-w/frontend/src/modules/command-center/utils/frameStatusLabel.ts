import type { RawFrameItem } from '../types/commandCenter.types';

type FrameStatus = RawFrameItem['statusEvent'];

/** Plain-language names for the link quality of a frame (the raw codes stay in the data). */
export const FRAME_STATUS_LABEL: Record<FrameStatus, string> = {
  FRAME_RECEIVED: 'Good',
  MULTI_GW: 'MULTI GW',
  WEAK_RSSI: 'Weak signal',
  DEGRADED: 'Noisy',
  POOR_LINK: 'Weak & noisy',
};

export const FRAME_STATUS_HELP: Record<FrameStatus, string> = {
  FRAME_RECEIVED: 'The frame arrived with a healthy signal.',
  MULTI_GW: 'The frame arrived with a healthy signal and more than one gateway heard it.',
  WEAK_RSSI: 'The signal was weak (below -95 dBm). The meter is far from the gateway or blocked.',
  DEGRADED: 'The signal had a lot of noise (SNR below -10 dB). The frame arrived, but the link is marginal.',
  POOR_LINK: 'The signal was both weak and noisy. Frames from this meter may be lost.',
};

export function frameStatusLabel(status: FrameStatus): string {
  return FRAME_STATUS_LABEL[status] ?? status;
}
