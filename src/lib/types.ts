// An image the user attached to an earlier turn, read back from a session.
// The bytes are not in the event -- the backend keeps them as an artifact and
// hands them over one request at a time -- so all a restored message carries is
// where to fetch them from.
export interface MessageArtifact {
  // Where the stored file is on this app's server, as a path for
  // SessionStorage.loadArtifact(). The request needs the login pass and the
  // base path, which that call adds -- so this is not usable as an <img src>.
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

export type RunState = "idle" | "running";

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  // From the backend's `run_state`. Both the detail and the list endpoint
  // report it; a backend that omits the field reads as "idle".
  runState: RunState;
}
