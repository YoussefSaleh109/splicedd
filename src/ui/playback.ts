import React from "react";
import { PlayerState } from "./components/PlayerBar";

/**
 * Represents a shared audio context with player bar support.
 */
export interface SamplePlaybackContext {
  cancellation: SamplePlaybackCancellation | null;
  setCancellation: React.Dispatch<React.SetStateAction<SamplePlaybackCancellation | null>>;
  setPlayerState: React.Dispatch<React.SetStateAction<PlayerState | null>>;
  /** UUID of the currently playing sample (null if nothing playing) */
  playingSampleUuid: string | null;
  setPlayingSampleUuid: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Represents a function that can signal to the current owner of a given context to
 * give up control over said context.
 */
export type SamplePlaybackCancellation = () => void;
