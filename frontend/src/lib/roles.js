export const ROLE_SUPER_ADMIN = "super_admin";
export const ROLE_KOORWAS = "koorwas";
export const ROLE_KETUA_TIM = "ketua_tim";
export const ROLE_ANGGOTA_TIM = "anggota_tim";

export const ROLE_LABELS = {
  [ROLE_SUPER_ADMIN]: "Super Admin",
  [ROLE_KOORWAS]: "Koorwas",
  [ROLE_KETUA_TIM]: "Ketua Tim",
  [ROLE_ANGGOTA_TIM]: "Anggota Tim",
};

export const ROLE_OPTIONS = [ROLE_SUPER_ADMIN, ROLE_KOORWAS, ROLE_KETUA_TIM, ROLE_ANGGOTA_TIM];

export const roleLabel = role => ROLE_LABELS[role] || role;
export const isSuperAdmin = user => user?.role === ROLE_SUPER_ADMIN;
export const canCreateTeam = user => user?.role === ROLE_SUPER_ADMIN || user?.role === ROLE_KETUA_TIM;
export const canViewAllTeams = user => user?.role === ROLE_SUPER_ADMIN || user?.role === ROLE_KOORWAS;
