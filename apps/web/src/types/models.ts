// Row types for the tables the web app reads. Kept in sync with supabase/migrations.
export type BusinessCategory = "barbershop" | "salon" | "clinic" | "spa" | "other";
export type ApplicationStatus = "pending" | "approved" | "rejected";
export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed" | "no_show";
export type BookingSource = "whatsapp" | "web" | "admin";
export type MemberRole = "owner" | "staff";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_super_admin: boolean;
}

export interface Business {
  id: string;
  slug: string;
  name: string;
  category: BusinessCategory;
  city: string | null;
  timezone: string;
  currency: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  status: "active" | "suspended";
  booking_code: string;
  deposit_required: boolean;
  deposit_amount: number;
  cancellation_hours: number;
  reminder_hours: number[];
  bot_tone: string;
  bot_instructions: string | null;
  onboarding_completed: boolean;
  created_at: string;
}

export interface Membership {
  business_id: string;
  user_id: string;
  role: MemberRole;
  staff_id: string | null;
  businesses: Business;
}

export interface Application {
  id: string;
  user_id: string;
  business_name: string;
  category: BusinessCategory;
  city: string;
  phone: string;
  timezone: string;
  status: ApplicationStatus;
  reviewer_note: string | null;
  reviewed_at: string | null;
  business_id: string | null;
  created_at: string;
  profiles?: Pick<Profile, "full_name" | "email"> | null;
}

export interface Staff {
  id: string;
  business_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  color: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  buffer_min: number;
  is_active: boolean;
}

export interface StaffService {
  business_id: string;
  staff_id: string;
  service_id: string;
}

export interface WorkingHours {
  id: string;
  business_id: string;
  staff_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface TimeOff {
  id: string;
  business_id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export interface Customer {
  id: string;
  business_id: string;
  phone: string;
  name: string | null;
  notes: string | null;
  opted_in_whatsapp: boolean;
  created_at: string;
}

export interface Booking {
  id: string;
  business_id: string;
  customer_id: string;
  staff_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  source: BookingSource;
  price: number;
  notes: string | null;
  cancelled_reason: string | null;
  created_at: string;
  customers?: Pick<Customer, "id" | "name" | "phone"> | null;
  services?: Pick<Service, "id" | "name" | "duration_min"> | null;
  staff?: Pick<Staff, "id" | "display_name" | "color"> | null;
}

export interface Conversation {
  id: string;
  business_id: string | null;
  customer_id: string | null;
  phone: string;
  channel: "whatsapp" | "simulator";
  state: Record<string, unknown>;
  last_message_at: string;
  handoff_to_human: boolean;
  customers?: Pick<Customer, "name"> | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  business_id: string | null;
  direction: "in" | "out";
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_name: string | null;
  tool_payload: unknown;
  created_at: string;
}

export interface KnowledgeItem {
  id: string;
  business_id: string;
  title: string;
  content: string;
}

export interface PublicBusiness {
  business: Pick<
    Business,
    | "id"
    | "slug"
    | "name"
    | "category"
    | "city"
    | "timezone"
    | "currency"
    | "phone"
    | "address"
    | "logo_url"
    | "booking_code"
    | "cancellation_hours"
  >;
  services: Pick<Service, "id" | "name" | "description" | "duration_min" | "price">[];
  staff: (Pick<Staff, "id" | "display_name" | "bio" | "avatar_url" | "color"> & {
    service_ids: string[];
  })[];
}
