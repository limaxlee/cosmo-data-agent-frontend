export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  image?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
