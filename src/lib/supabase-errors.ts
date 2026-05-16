export function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const message = "message" in error ? error.message : null;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}