// An image the user attached to an earlier turn, read back from a session.
// The bytes are not in the event -- the backend keeps them as an artifact and
// hands them over one request at a time -- so all a restored message carries is
// where to fetch them from.
export interface MessageArtifact {
  // Ready-to-fetch, same-origin URL for the stored file.
  url: string;
  filename?: string;
  mimeType?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  // Set on a message the user just sent: the file as a data URL, straight from
  // the picker. Restored messages use `artifact` instead.
  image?: string;
  artifact?: MessageArtifact;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  // True while the backend is still producing a reply for this session. A
  // session opened in this state is waited on rather than shown as finished.
  isRunning: boolean;
}
