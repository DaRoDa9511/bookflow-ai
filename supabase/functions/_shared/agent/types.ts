// Minimal Messages API shapes used by the agent core. The Edge Function adapts the
// official Anthropic SDK to `LlmClient`; tests plug in a scripted mock.

export interface TextBlock {
  type: "text";
  text: string;
}
export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
/** Any other block (thinking, fallback, …) is passed back to the API untouched. */
export interface OtherBlock {
  type: string;
  [key: string]: unknown;
}
export type ContentBlock = TextBlock | ToolUseBlock | OtherBlock;

export interface LlmMessage {
  role: "user" | "assistant";
  content: string | (ContentBlock | ToolResultBlock)[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  strict?: boolean;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
}

export interface LlmResponse {
  content: ContentBlock[];
  stop_reason: string | null;
}

export interface LlmClient {
  create(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse>;
}

// ── Domain ────────────────────────────────────────────────────────────

export interface BusinessInfo {
  id: string;
  slug: string;
  name: string;
  category: string;
  city: string | null;
  timezone: string;
  currency: string;
  phone: string | null;
  address: string | null;
  booking_code: string;
  cancellation_hours: number;
  bot_tone: string;
  bot_instructions: string | null;
  status: string;
}

export interface ServiceInfo {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
}

export interface StaffInfo {
  id: string;
  display_name: string;
  bio: string | null;
  service_ids: string[];
}

export interface BusinessContext {
  business: BusinessInfo;
  services: ServiceInfo[];
  staff: StaffInfo[];
  hours: { staff_id: string; weekday: number; start_time: string; end_time: string }[];
  knowledge: { title: string; content: string }[];
}

export interface CustomerBooking {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  service_id: string;
  service_name: string;
  staff_id: string;
  staff_name: string;
  price: number;
}

export interface ConversationRow {
  id: string;
  business_id: string | null;
  customer_id: string | null;
  phone: string;
  channel: "whatsapp" | "simulator";
  handoff_to_human: boolean;
  state: Record<string, unknown>;
}

export interface StoredMessage {
  role: "user" | "assistant" | "tool" | "system";
  direction: "in" | "out";
  content: string;
  tool_name?: string | null;
  tool_payload?: unknown;
  provider_message_id?: string | null;
}

/** Error with one of our SQL error codes (slot_taken, cancellation_window, …). */
export class AgentError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}
