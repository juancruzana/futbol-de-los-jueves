export type Format = "F5" | "F6" | "F7" | "F8" | "F9" | "F11";

export type Role = "admin" | "jugador";

/** Un grupo del que soy parte, con mi rol en él. */
export type Group = {
  id: string;
  name: string;
  invite_code: string;
  role: Role;
};

export type Member = {
  user_id: string;
  role: Role;
};

export type Player = {
  id: string;
  group_id: string;
  name: string;
  active: boolean;
  user_id: string | null;
  created_at: string;
};

export type Match = {
  id: string;
  group_id: string;
  date: string; // YYYY-MM-DD
  format: Format;
  status: "abierto" | "jugado";
  slots: string[]; // "20:00"
  time: string | null; // horario confirmado
  score_a: number;
  score_b: number;
  mvp: string | null;
  /** votación de la figura entre los que jugaron (null = nunca se abrió) */
  mvp_vote: "abierta" | "cerrada" | null;
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

/** Voto de figura: quién votó a quién. */
export type MvpVote = {
  match_id: string;
  voter_id: string;
  player_id: string;
};

export type Data = {
  players: Player[];
  matches: Match[];
  availability: Availability[];
  lineups: Lineup[];
  /** la RLS solo deja ver los votos de figura propios, salvo al organizador o con la votación cerrada */
  mvpVotes: MvpVote[];
  members: Member[];
};
