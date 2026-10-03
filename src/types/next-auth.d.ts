import type { Role } from "@/generated/prisma/enums";

declare module "@auth/core/types" {
  interface User {
    role: Role;
    sessionVersion: number;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      sessionVersion: number;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role: Role;
    sessionVersion: number;
  }
}
