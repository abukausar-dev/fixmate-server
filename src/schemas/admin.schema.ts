import { z } from "zod";

export const USER_ROLES = ["customer", "technician", "admin"] as const;

export const updateUserRoleSchema = z.object({
    role: z.enum(USER_ROLES, {
        message: "Role must be customer, technician, or admin",
    }),
});