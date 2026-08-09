/**
 * musicTracks.ts — Client-side catalog of music tracks.
 *
 * IDs match the cosmetic_item IDs seeded in server/storage.ts.
 * Audio files live at client/public/audio/{slug}.mp3
 *
 * Free tracks (free: true) are auto-owned by all players — no purchase needed.
 * Coming-soon tracks are display-only placeholders; not purchasable or playable.
 */

export interface MusicTrackDef {
  /** Matches cosmeticItems.id in the DB */
  id: string;
  /** Display title */
  title: string;
  /** Full playback path */
  audioPath: string;
  /** Preview path (falls back to audioPath for 15s clip) */
  previewPath: string;
  /** If true: free for all players — no Stripes required */
  free?: boolean;
}

export interface ComingSoonTrackDef {
  title: string;
}

// ── Active tracks (2 free + 11 paid) ─────────────────────────────────────────
export const MUSIC_CATALOG: MusicTrackDef[] = [
  // Free — unlocked for every player
  { id: 'music_chain_gang_poker',       title: 'Chain Gang Poker',       free: true, audioPath: '/audio/chain-gang-poker.mp3',       previewPath: '/audio/chain-gang-poker.mp3'       },
  { id: 'music_chain_gang_nights',      title: 'Chain Gang Nights',      free: true, audioPath: '/audio/chain-gang-nights.mp3',      previewPath: '/audio/chain-gang-nights.mp3'      },
  // Paid — ◆ 500 Stripes each
  { id: 'music_no_halfway',             title: 'No Halfway',             audioPath: '/audio/no-halfway.mp3',             previewPath: '/audio/no-halfway.mp3'             },
  { id: 'music_borrowed_time',          title: 'Borrowed Time',          audioPath: '/audio/borrowed-time.mp3',          previewPath: '/audio/borrowed-time.mp3'          },
  { id: 'music_the_mask',               title: 'The Mask',               audioPath: '/audio/the-mask.mp3',               previewPath: '/audio/the-mask.mp3'               },
  { id: 'music_prove_the_shadow',       title: 'Prove the Shadow',       audioPath: '/audio/prove-the-shadow.mp3',       previewPath: '/audio/prove-the-shadow.mp3'       },
  { id: 'music_blood_by_choice',        title: 'Blood by Choice',        audioPath: '/audio/blood-by-choice.mp3',        previewPath: '/audio/blood-by-choice.mp3'        },
  { id: 'music_as_bad_as_air',          title: 'As Bad As Air',          audioPath: '/audio/as-bad-as-air.mp3',          previewPath: '/audio/as-bad-as-air.mp3'          },
  { id: 'music_before_you_judge',       title: 'Before You Judge',       audioPath: '/audio/before-you-judge.mp3',       previewPath: '/audio/before-you-judge.mp3'       },
  { id: 'music_everything_a_test',      title: 'Everything a Test',      audioPath: '/audio/everything-a-test.mp3',      previewPath: '/audio/everything-a-test.mp3'      },
  { id: 'music_built_in_the_dark',      title: 'Built In The Dark',      audioPath: '/audio/built-in-the-dark.mp3',      previewPath: '/audio/built-in-the-dark.mp3'      },
  { id: 'music_if_heaven_had_a_hallway',title: 'If Heaven Had a Hallway',audioPath: '/audio/if-heaven-had-a-hallway.mp3',previewPath: '/audio/if-heaven-had-a-hallway.mp3'},
  { id: 'music_weight_of_my_words',     title: 'Weight of My Words',     audioPath: '/audio/weight-of-my-words.mp3',     previewPath: '/audio/weight-of-my-words.mp3'     },
];

// ── Coming soon — display-only placeholders ───────────────────────────────────
export const COMING_SOON_TRACKS: ComingSoonTrackDef[] = [
  { title: 'Forged'           },
  { title: "Bricks Don't Lie" },
  { title: 'The War Inside'   },
];

/** IDs of tracks that are free for all players (no purchase required) */
export const FREE_MUSIC_IDS = new Set(
  MUSIC_CATALOG.filter(t => t.free === true).map(t => t.id)
);

/** IDs of all active (purchasable or free) tracks */
export const MUSIC_TRACK_IDS = new Set(MUSIC_CATALOG.map(t => t.id));

/** Resolve track definition by cosmetic item ID */
export function trackById(id: string): MusicTrackDef | undefined {
  return MUSIC_CATALOG.find(t => t.id === id);
}
