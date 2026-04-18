/** Maps raw translation pipeline errors to a user-safe message plus optional dev-only technical copy. */
export function translationErrorForUserModal(raw: string): {
  userMessage: string
  devTechnical?: string
} {
  const t = raw.trim()
  if (!t) return { userMessage: "Something went wrong. Tap Retry." }

  if (
    t.includes("Chunking was cut off mid-page") ||
    t.includes("The model hit its output limit before finishing chunking") ||
    (t.includes("LLM_CHUNK_INPUT_CHAR_CAP") && t.includes("TRANSLATE_MAX_COMPLETION_TOKENS"))
  ) {
    return {
      userMessage:
        "This page’s translation didn’t finish (the model hit an output limit). Tap Retry. If it keeps failing, try shorter text.",
      devTechnical: t,
    }
  }

  if (t.startsWith("No JSON array found in response")) {
    return {
      userMessage:
        "The translation service returned an unexpected response. Tap Retry. If it keeps failing, check your connection.",
      devTechnical: t,
    }
  }

  if (t.includes("Model returned no usable chunk rows")) {
    return {
      userMessage:
        "Translation didn’t return usable highlighted chunks for this page. Tap Retry.",
      devTechnical: t,
    }
  }

  if (t === "Empty model response" || t === "Empty response from language model.") {
    return {
      userMessage: "The translation service returned an empty response. Tap Retry.",
      devTechnical: t,
    }
  }

  return { userMessage: t }
}
