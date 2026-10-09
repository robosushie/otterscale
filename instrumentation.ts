export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { refreshAppsRoutesOnBoot } = await import("@/lib/apps/publish");
    await refreshAppsRoutesOnBoot();
  } catch (error) {
    console.error("apps routes boot write failed", error);
  }
}
