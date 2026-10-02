export type Format = "F5" | "F6" | "F7" | "F8" | "F9" | "F11";

export type Player = {
  id: string;
  name: string;
  active: boolean;
  user_id: string | null;
  created_at: string;
};

export type Match = {
  id: string;
  date: string; // YYYY-MM-DD
  format: Format;
  status: "abierto" | "jugado";
  slots: string[]; // "20:00"
  time: string | null; // horario confirmado
  score_a: number;
  score_b: number;
  mvp: string | null;
  created_at: string;
  played_at: string | null;
};

export type Availability = {
  match_id: string;
  player_id: string;
  going: boolean;
  hours: string[];
};

export type Lineup = {
  match_id: string;
  player_id: string;
  team: "A" | "B";
  goals: number;
};

export type Data = {
  players: Player[];
  matches: Match[];
  availability: Availability[];
  lineups: Lineup[];
};
