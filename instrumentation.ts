export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("@/lib/env");
  const { logger } = await import("@/lib/logger");

  validateEnv();
  logger.info("Server instance starting", { nodeEnv: process.env.NODE_ENV });
}
