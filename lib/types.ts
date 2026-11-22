export type Mode = 'local' | 'p2p' | 'group';
export type View =
  'chats' | 'contacts' | 'connect' | 'settings' | 'mentions' | 'starred' | 'spaces' | 'devices' | 'stats';
export type PreviewPolicy = 'ask' | 'block' | 'allow';
export type Presence = 'online' | 'dnd' | 'away';
export type SettingsSection =
  'general' | 'notifications' | 'media' | 'look' | 'a11y' | 'restrict' | 'privacy' | 'lock' | 'backup';

/** Self-destruct / disappearing message timer. 0 means no extra timer (legacy 72h expiry still applies). */
export type DisappearMode = '72h' | '1h' | '1m' | '10s';
export const DISAPPEAR_MS: Record<DisappearMode, number> = {
  '72h': 72 * 60 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1m': 60 * 1000,
  '10s': 10 * 1000,
};

export interface LinkedDevice {
  id: string;
  name: string;
  addedAt: number;
  isCurrent?: boolean;
}

/** A user-made group of contacts ("Alan") — local organisation, no network. */
export interface Space {
  id: string;
  name: string;
  hue: number;
  members: string[];
}

export interface LinkMeta {
  url: string;
  title?: string;
  description?: string;
  isImage?: boolean;
}

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupInvite {
  id: string;
  gid: string;
  code: string; // shareable invite token
  createdAt: number;
  expiresAt?: number;
  maxUses?: number;
  uses: number;
  createdBy: string;
  revoked?: boolean;
}

export interface Conversation {
  id: string;
  mode: Mode;
  title: string;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  unread: number;
  starred?: boolean; // collected under the "Yıldızlı" rail shortcut
  pinnedMessages?: string[]; // message ids pinned to the top of this conversation
  contactId?: string; // set for p2p conversations
  wall?: string; // chat wallpaper (gradient id)
  members?: string[]; // group: member fingerprints, mine included
  hue?: number; // group avatar hue
  names?: Record<string, string>; // group: roster names for members who are not my contacts
  left?: boolean; // group: I left — kept only until the next purge
  /** Last local or synced mutation; used by multi-device last-writer-wins merging. */
  syncAt?: number;
  /** Disappearing message mode for this conversation. Defaults to 72h. */
  disappear?: DisappearMode;
  /** Group roles by member fingerprint. */
  roles?: Record<string, GroupRole>;
  /** Group invite links (local metadata, shared to members as signed control messages). */
  invites?: GroupInvite[];
  /** Broadcast channel: only owners/admins can post. */
  broadcast?: boolean;
  /** Public/discoverable group (opt-in). */
  discoverable?: boolean;
  /** Folder/category label for chat organization. */
  folder?: string;
}
export type Attachment =
  | {
      t: 'file';
      kind: 'image' | 'document' | 'voice' | 'video';
      name: string;
      mime: string;
      size: number;
      dur?: number;
      /** Optional thumbnail data URL for video/image preview. */
      thumb?: string;
    }
  | { t: 'gif'; url: string; w: number; h: number }
  | { t: 'sticker'; pack: string; id: string; url?: string; emoji?: string }
  | { t: 'location'; lat: number; lon: number; live?: boolean; until?: number }
  | { t: 'contact'; name: string; code: string; pub: string }
  | {
      t: 'poll';
      q: string;
      opts: string[];
      multi: boolean;
      votes: Record<string, number[]>;
      anonymous?: boolean;
    }
  | {
      t: 'event';
      title: string;
      start: number;
      place?: string;
      note?: string;
      rsvp?: Record<string, 'yes' | 'no' | 'maybe'>;
      reminderAt?: number;
    };

export interface Message {
  id: string;
  conversationId: string;
  body: string;
  createdAt: number;
  expiresAt: number; // epoch ms (UTC); expiresAt = createdAt + 72h by default, or earlier for disappearing modes
  link?: LinkMeta;
  replyToId?: string;
  att?: Attachment; // file bytes live in the local_blobs store under the message id
  direction?: 'in' | 'out'; // missing means out
  from?: string; // group: sender member id (my sends carry my fingerprint)
  status?: 'queued' | 'sent' | 'delivered' | 'seen'; // p2p/group outgoing only
  reactions?: Record<string, string[]>; // emoji -> member ids
  editedAt?: number; // last edit time, shown as a marker
  /** Last local or synced mutation; used by multi-device last-writer-wins merging. */
  syncAt?: number;
  /** Client-side hint: sender requested screenshot/screen-record warning for this message. */
  sensitive?: boolean;
  /** Local-only: message was flagged by screenshot/screen-record detection. */
  captureWarnedAt?: number;
}
export interface Contact {
  id: string;
  pub: string;
  name: string;
  code: string;
  addedAt: number;
  verified: boolean;
  photo?: string;
  renamed?: boolean;
  ek?: string;
  blocked?: boolean;
  note?: string;
  label?: string;
  syncAt?: number;
}
export interface Settings {
  theme: 'dark' | 'light';
  previews: PreviewPolicy;
  accent: string;
  presence: Presence; // capsule status: online / do-not-disturb / away
  notify?: boolean;
  notifySound?: boolean;
  notifyPreview?: boolean;
  reduceMotion?: boolean;
  textScale?: 's' | 'm' | 'l';
  /** Message bubble style preset. */
  bubbleStyle?: 'default' | 'imessage' | 'whatsapp' | 'telegram';
  /** Voice message playback speed. */
  voiceSpeed?: 1 | 1.5 | 2;
  /** Best-effort screenshot/screen recording warnings. */
  captureWarnings?: boolean;
  /** Blur incoming media until tapped. */
  blurMedia?: boolean;
  /** Panic wipe: number of failed vault unlock attempts before wipe (0 disables). */
  panicWipeAfter?: 0 | 5 | 10;
  /** Panic wipe code phrase (entered in unlock field). */
  panicCode?: string;
  /** Local-only chat folders/labels enabled. */
  chatFolders?: boolean;
  /** Auto backup interval in hours (0 disables). */
  autoBackupHours?: 0 | 24 | 168;
}
