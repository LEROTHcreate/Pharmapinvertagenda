import { handlers } from "@/auth";

// Force le runtime Node.js (bcrypt + Prisma)
export const runtime = "nodejs";

export const { GET, POST } = handlers;
