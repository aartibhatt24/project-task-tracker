export type Role = 'MANAGER' | 'MEMBER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}
