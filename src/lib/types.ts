export type Role = 'admin' | 'agency' | 'photographer' | 'lead';
export type PropertyStatus = 'draft' | 'new_request' | 'photography' | 'qa_review' | 'published' | 'sold';
export type MissionStatus = 'available' | 'assigned' | 'signed' | 'completed' | 'cancelled';
export type SettlementStatus = 'unpaid' | 'settled';
export type PhotographerStatus = 'pending' | 'active' | 'suspended';

export interface Profile {
  authUid: string;
  userId: number;
  fullName: string;
  email: string;
  role: Role;
  agencyId: number | null;
  agencyName: string | null;
  photographerId: number | null;
  photographerStatus: PhotographerStatus | null;
  photographerCity: string | null;
}

export interface Property {
  id_property: number;
  id_agency: number;
  title: string;
  description: string | null;
  price: number | null;
  property_type: string;
  status: PropertyStatus;
  city: string;
  units_count: number;
  masked_address: string | null;
  client_phone_masked: string | null;
  created_at: string;
}

export interface Mission {
  id_mission: number;
  id_property: number;
  id_photographer: number | null;
  mission_price: number;
  photographer_fee: number;
  target_date: string | null;
  mission_status: MissionStatus;
  settlement_status: SettlementStatus;
  settled_at: string | null;
  created_at: string;
}

export interface Tour {
  id_tour: number;
  id_property: number;
  tour_url: string | null;
  embed_code: string | null;
  num_scenes: number;
  is_active: boolean;
}

export interface Scene {
  id_scene: number;
  id_tour: number;
  scene_title: string;
  image_url: string;
  initial_view_parameters: { yaw?: number; pitch?: number; hfov?: number };
  position: number;
}

export interface Hotspot {
  id_hotspot: number;
  id_scene: number;
  target_scene_id: number | null;
  title: string;
  hotspot_type: string;
  pitch: number;
  yaw: number;
}

export interface Lead {
  id_lead: number;
  id_property: number | null;
  full_name: string;
  email: string;
  phone: string;
  user_category: string;
  message: string | null;
  source_url: string | null;
  forwarded_at: string | null;
  created_at: string;
}
