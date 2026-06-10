export type Program = 'CP' | 'YL' | 'GEP';

export interface ClassTiming {
  days: string[]; // ['Mon', 'Wed'], ['Tue', 'Thu'], etc.
  time: string;   // '08:00-09:30', '09:45-11:15', etc.
}

export interface ClassDefinition {
  id: string;        // Unique section identifier, e.g., 'CP-1-A'
  name: string;      // Human label shown in cell, e.g., 'CP 1'
  program: Program;
  level: string;     // '1', '2', '11A', '11B', '12' etc.
  days: string[];    // Meeting days, e.g. ['Mon', 'Wed']
  time: string;      // Meeting timeslot, e.g. '08:00-09:30'
  groupCode?: string; // Optional code grouping identical levels
  teacher?: string;  // Optional teacher name
  classCode?: string; // Optional official section/class code
  offset?: number;    // Optional offset to preserve exact solved schedule positioning
}

export interface ProgramRotation {
  frequency: number; // 2 (biweekly), 3 (triweekly), 4 (quadweekly)
  offset: number;    // 0, 1, 2, 3 (relative to week 2, so Week = 2 + k*freq + offset)
}

export interface RoomConfig {
  name: string;
  maxClassesPerSlot: number;
  maxMergedGroupsPerSlot: number;
}

export interface HolidayConfig {
  id: string;
  week: number;
  day: string; // 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'
  name: string; // e.g. "Thanksgiving Day", "GILC Closed"
}

export interface SolverSettings {
  maxClassesPerSlot: number;       // Default room settings (fallback)
  maxMergedGroupsPerSlot: number;  // Default room settings (fallback)
  levelMergeDistance: number;      // Maximum physical levels distance for merge (typically 1)
  evenWeekProgram: 'CP_YL' | 'GEP' | 'ALL'; // Legacy compatibility
  oddWeekProgram: 'CP_YL' | 'GEP' | 'ALL';  // Legacy compatibility
  termLengthWeeks: number;         // Defaults to 10
  startDate: string;              // '2026-06-15'
  allowGEPIgnoreSequential?: boolean; // If true, all 3 GEP levels can ignore sequential rules and merge
  
  // Advanced features
  programRotations?: Record<Program, ProgramRotation>;
  roomAssignments?: Record<Program, string>; // e.g., { CP: 'GILC', YL: 'GILC', GEP: 'GILC' }
  rooms?: RoomConfig[]; // Custom rooms and capacities
  holidays?: HolidayConfig[];
}

export interface ScheduledSlot {
  week: number;       // e.g. 2, 3, 4, 5
  day: string;        // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
  time: string;       // '08:00-09:30'
  room: string;       // 'GILC' or 'G1'
  classIds: string[]; // List of classIds scheduled in this slot
}

export type TermSchedule = Record<string, string[]>; // key: "week-day-time-room", val: classIds []

export interface SolverResult {
  schedule: Record<string, string[]>;
  unscheduled: Array<{ week: number; room: string; class: ClassDefinition }>;
  message: string;
  isPerfect: boolean;
  classOffsets?: Record<string, number>;
}
